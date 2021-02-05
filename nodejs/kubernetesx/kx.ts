// Copyright 2016-2019, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import PodBuilderDeploymentSpec = types.PodBuilderDeploymentSpec;

export namespace types {
    export type EnvMap = Record<string, pulumi.Input<string | k8s.types.input.core.v1.EnvVarSource>>;
    export type PortMap = Record<string, pulumi.Input<number>>;

    export enum ServiceType {
        ClusterIP = "ClusterIP",
        LoadBalancer = "LoadBalancer",
    }
    export type VolumeMount = {
        volume: pulumi.Input<k8s.types.input.core.v1.Volume>,
        destPath: pulumi.Input<string>,
        srcPath?: pulumi.Input<string>,
    };
    export type Container = Omit<k8s.types.input.core.v1.Container, "env"|"name"|"ports"|"volumeMounts"> & {
        env?: pulumi.Input<pulumi.Input<k8s.types.input.core.v1.EnvVar>[] | EnvMap>,
        name?: pulumi.Input<string>,
        ports?: pulumi.Input<pulumi.Input<k8s.types.input.core.v1.ContainerPort>[] | PortMap>,
        volumeMounts?: pulumi.Input<pulumi.Input<k8s.types.input.core.v1.VolumeMount | VolumeMount>[]>,
    };
    export type PodSpec = Omit<k8s.types.input.core.v1.PodSpec, "containers"|"initContainers"> & {
        containers: pulumi.Input<pulumi.Input<Container>[]>,
        initContainers: pulumi.Input<pulumi.Input<Container>[]>,
    };
    export type Pod = Omit<k8s.types.input.core.v1.Pod, "spec"> & {
        spec: pulumi.Input<PodSpec | PodBuilder>,
    };
    export type DeploymentSpec = Omit<k8s.types.input.apps.v1.DeploymentSpec, "template"> & {
        template: pulumi.Input<Pod>,
    };
    export type Deployment = Omit<k8s.types.input.apps.v1.Deployment, "spec"> & {
        spec: pulumi.Input<DeploymentSpec | k8s.types.input.apps.v1.DeploymentSpec>,
    };
    export type ServiceSpec = Omit<k8s.types.input.core.v1.ServiceSpec, "ports"|"type"> & {
        ports?: pulumi.Input<pulumi.Input<k8s.types.input.core.v1.ServicePort>[] | PortMap>,
        type?: pulumi.Input<ServiceType | string>,
    };
    export type Service = Omit<k8s.types.input.core.v1.Service, "spec"> & {
        spec: pulumi.Input<ServiceSpec>,
    };
    export type StatefulSetSpec = Omit<k8s.types.input.apps.v1.StatefulSetSpec, "template"> & {
        template: pulumi.Input<Pod>,
    };
    export type StatefulSet = Omit<k8s.types.input.apps.v1.StatefulSet, "spec"> & {
        spec: pulumi.Input<StatefulSetSpec | k8s.types.input.apps.v1.StatefulSetSpec>,
    };
    export type JobSpec = Omit<k8s.types.input.batch.v1.JobSpec, "template"> & {
        template: pulumi.Input<Pod>,
    };
    export type Job = Omit<k8s.types.input.batch.v1.Job, "spec"> & {
        spec: pulumi.Input<JobSpec | k8s.types.input.batch.v1.JobSpec>,
    };

    export type PodBuilderDeploymentSpec = Omit<k8s.types.input.apps.v1.DeploymentSpec, "selector"|"template">;
    export type PodBuilderJobSpec = Omit<k8s.types.input.batch.v1.JobSpec, "template">;
}

function buildPodSpec(args: pulumi.Input<types.PodSpec>): pulumi.Output<k8s.types.input.core.v1.PodSpec> {
    return pulumi.output<types.PodSpec>(args).apply(podSpec => {
        const volumes: k8s.types.input.core.v1.Volume[] = [];
        const initContainers = podSpec.initContainers.map(container => buildContainer(container, volumes));
        const containers = podSpec.containers.map(container => buildContainer(container, volumes));
        return pulumi.output({
            ...podSpec,
            initContainers: initContainers,
            containers: containers,
            volumes: [
                ...podSpec.volumes || [],
                ...volumes,
            ],
        });
    });
}

function buildContainer(container: pulumi.UnwrappedObject<types.Container>, volumes: k8s.types.input.core.v1.Volume[]): k8s.types.input.core.v1.Container {
    const isEnvMap = (env: any): env is pulumi.UnwrappedObject<types.EnvMap> => env.length === undefined;
    const isPortMap = (ports: any): ports is pulumi.UnwrappedObject<types.PortMap> => ports.length === undefined;
    const isMountObject = (object: any): object is pulumi.UnwrappedObject<types.VolumeMount> => object.hasOwnProperty("volume");
    const c: pulumi.UnwrappedObject<k8s.types.input.core.v1.Container> = {
        ...container,
        env: [],
        name: "",
        ports: [],
        volumeMounts: [],
    };
    if (container.name) {
        c.name = container.name;
    } else {
        const re = /(.*\/|^)(?<image>\w+)(:(?<tag>.*))?/;
        const imageArg = container.image || "";
        const result = re.exec(imageArg);
        if (!result) {
            throw new Error("Failed to parse image name from " + imageArg);
        }
        c.name = result[2];
    }
    const env = container.env;
    if (env) {
        if (isEnvMap(env)) {
            Object.keys(env).forEach(key => {
                const value = env[key];
                if (typeof value === "string") {
                    c.env!.push({name: key, value: value});
                } else {
                    c.env!.push({name: key, valueFrom: value});
                }
            });
        } else {
            c.env = env;
        }
    }
    const ports = container.ports;
    if (ports) {
        if (isPortMap(ports)) {
            Object.keys(ports).forEach(key => {
                const value = ports[key];
                c.ports!.push({name: key, containerPort: value});
            });
        } else {
            c.ports = ports;
        }
    }
    const volumeMounts = container.volumeMounts;
    if (volumeMounts) {
        volumeMounts.forEach(mount => {
            if (isMountObject(mount)) {
                c.volumeMounts!.push({
                    name: mount.volume.name,
                    mountPath: mount.destPath,
                    subPath: mount.srcPath,
                });
                volumes.push({
                    ...mount.volume,
                });
            } else {
                c.volumeMounts!.push(mount);
            }
        });
    }
    return c;
}

export class PodBuilder {
    public readonly podSpec: pulumi.Output<k8s.types.input.core.v1.PodSpec>;
    private readonly podName: pulumi.Output<string>;

    constructor(args: types.PodSpec) {
        this.podSpec = buildPodSpec(args);
        this.podName = this.podSpec.containers.apply((containers: k8s.types.input.core.v1.Container[]) => {
            return pulumi.output(containers[0].name);
        });
    }

    public asDeploymentSpec(
        args?: types.PodBuilderDeploymentSpec,
        ): pulumi.Output<k8s.types.input.apps.v1.DeploymentSpec> {
        const appLabels = { app: this.podName };

        const _args = args || {};
        const deploymentSpec: k8s.types.input.apps.v1.DeploymentSpec = {
            ..._args,
            selector: { matchLabels: appLabels },
            replicas: _args.replicas || 1,
            template: {
                metadata: { labels: appLabels },
                spec: this.podSpec,
            },
        };
        return pulumi.output(deploymentSpec);
    }

    public asStatefulSetSpec(args?: {replicas?: number}): pulumi.Output<k8s.types.input.apps.v1.StatefulSetSpec> {
        const appLabels = { app: this.podName };
        const statefulSetSpec: k8s.types.input.apps.v1.StatefulSetSpec = {
            selector: { matchLabels: appLabels },
            replicas: args && args.replicas || 1,
            serviceName: "", // This will be auto-generated by kx.StatefulSet.
            template: {
                metadata: { labels: appLabels },
                spec: this.podSpec,
            },
        };
        return pulumi.output(statefulSetSpec);
    }

    public asJobSpec(args?: types.PodBuilderJobSpec): pulumi.Output<k8s.types.input.batch.v1.JobSpec> {
        const appLabels = { app: this.podName };
        const jobSpec: k8s.types.input.batch.v1.JobSpec = {
            ...args,
            template: {
                metadata: { labels: appLabels },
                spec: this.podSpec,
            },
        };
        return pulumi.output(jobSpec);
    }
}

export class Pod extends k8s.core.v1.Pod {
    constructor(name: string, args: types.Pod, opts?: pulumi.CustomResourceOptions) {

        const isPodBuilder = (object: any): object is pulumi.UnwrappedObject<PodBuilder> => object.hasOwnProperty("podSpec");

        const spec: pulumi.Output<k8s.types.input.core.v1.PodSpec> = pulumi.output(args.spec).apply(specArg => {
            if (isPodBuilder(specArg)) {
                return pulumi.output(specArg.podSpec);
            } else {
                return buildPodSpec(specArg);
            }
        });
        super(name,
            {
                ...args,
                spec: spec,
            },
            opts);
    }
}

export class Deployment extends k8s.apps.v1.Deployment {
    private readonly name: string;
    private readonly opts?: pulumi.CustomResourceOptions;
    constructor(name: string, args: types.Deployment, opts?: pulumi.CustomResourceOptions) {
        const spec: pulumi.Output<k8s.types.input.apps.v1.DeploymentSpec> = pulumi.output<types.Deployment>(args)
            .apply(args => {
                const podSpec = buildPodSpec(args.spec.template.spec as types.PodSpec);
                return pulumi.output({
                    ...args.spec,
                    template: {
                        ...args.spec.template,
                        spec: podSpec,
                    },
                });
            });

        super(name,
            {
                ...args,
                spec: spec,
            },
            opts);

        this.name = name;
        this.opts = opts;
    }

    public createService(args: types.ServiceSpec = {}) {
        const serviceSpec = pulumi
            .all([this.spec.template.spec.containers, args])
            .apply(([containers, args]) => {
                // TODO: handle merging ports from args
                const ports: Record<string, number> = {};
                containers.forEach(container => {
                    if (container.ports) {
                        container.ports.forEach(port => {
                            ports[port.name] = port.containerPort;
                        });
                    }
                });
                return {
                    ...args,
                    ports: args.ports || ports,
                    selector: this.spec.selector.matchLabels,
                    // TODO: probably need to unwrap args.type in case it's a computed value
                    type: args && args.type as string,
                };
            });

        return new Service(this.name, {
            metadata: { namespace: this.metadata.namespace },
            spec: serviceSpec,
        }, {...this.opts, parent: this});
    }
}

export class Service extends k8s.core.v1.Service {
    constructor(name: string, args: types.Service, opts?: pulumi.CustomResourceOptions) {

        const spec = pulumi.output(args)
            .apply((args: pulumi.UnwrappedObject<types.Service>) => {
                const isPortMap = (ports: any): ports is types.PortMap => ports.length === undefined;

                let ports: k8s.types.input.core.v1.ServicePort[] = [];
                const portsArg = args.spec.ports;
                if (portsArg) {
                    if (isPortMap(portsArg)) {
                        Object.keys(portsArg).forEach(key => {
                            const value = portsArg[key];
                            ports.push({name: key, port: value});
                        });
                    } else {
                        ports = portsArg;
                    }
                }
                return {
                    ...args.spec,
                    ports: ports,
                    type: args.spec.type as string,
                };
            });

        super(name,
            {
                ...args,
                spec: spec,
            },
            opts);

    }

    /**
     * Endpoint of the Service. This can be either an IP address or a hostname,
     * depending on the k8s cluster provider.
     */
    get endpoint(): pulumi.Output<string> {
        return this.status.loadBalancer.ingress
            .apply((ingress: k8s.types.output.core.v1.LoadBalancerIngress[]) => {
            if (ingress.length > 0) {
                return ingress[0].ip || ingress[0].hostname;
            }
            return "";
        });
    }
}

export class StatefulSet extends pulumi.ComponentResource {
    private readonly name: string;
    private readonly opts?: pulumi.CustomResourceOptions;

    constructor(name: string, args: types.StatefulSet, opts?: pulumi.CustomResourceOptions) {
        const spec: pulumi.Output<k8s.types.input.apps.v1.StatefulSetSpec> = pulumi.output<types.StatefulSet>(args)
            .apply(args => {
                const podSpec = buildPodSpec(args.spec.template.spec as types.PodSpec);
                return pulumi.output({
                    ...args.spec,
                    serviceName: `${name}-service`,
                    template: {
                        ...args.spec.template,
                        spec: podSpec,
                    },
                });
            });

        super("kubernetesx:StatefulSet", name, {...args, spec: spec}, opts);

        const statefulSet = new k8s.apps.v1.StatefulSet(
            name,
            {...args, spec: spec},
            {...opts, parent: this},
            );

        this.name = name;
        this.opts = opts;

    }
}

export class Job extends k8s.batch.v1.Job {
    private readonly name: string;
    private readonly opts?: pulumi.CustomResourceOptions;

    constructor(name: string, args: types.Job, opts?: pulumi.CustomResourceOptions) {
        const spec: pulumi.Output<k8s.types.input.batch.v1.JobSpec> = pulumi.output<types.Job>(args)
            .apply(args => {
                const podSpec = buildPodSpec(args.spec.template.spec as types.PodSpec);
                return pulumi.output({
                    ...args.spec,
                    template: {
                        ...args.spec.template,
                        spec: podSpec,
                    },
                });
            });

        super(name,
            {
                ...args,
                spec: spec,
            },
            opts);

        this.name = name;
        this.opts = opts;
    }
}

export class PersistentVolumeClaim extends k8s.core.v1.PersistentVolumeClaim {
    constructor(name: string, args: k8s.types.input.core.v1.PersistentVolumeClaim, opts?: pulumi.CustomResourceOptions) {
        super(name, args, opts);
    }

    // TODO: define input type?
    public mount(destPath: pulumi.Input<string>, srcPath?: pulumi.Input<string>): pulumi.Output<types.VolumeMount> {
        return pulumi.output({
            volume: {
                name: this.metadata.name,
                persistentVolumeClaim: {
                    claimName: this.metadata.name,
                },
            },
            destPath: destPath,
            srcPath: srcPath,
        });
    }
}

export class ConfigMap extends k8s.core.v1.ConfigMap {
    constructor(name: string, args: k8s.types.input.core.v1.ConfigMap, opts?: pulumi.CustomResourceOptions) {
        super(name, args, opts);
    }

    public mount(destPath: pulumi.Input<string>, srcPath?: pulumi.Input<string>): pulumi.Output<types.VolumeMount> {
        return pulumi.output({
            volume: {
                name: this.metadata.name,
                configMap: {
                    name: this.metadata.name,
                    // TODO: items
                },
            },
            destPath: destPath,
            srcPath: srcPath,
        });
    }

    public asEnvValue(key: pulumi.Input<string>): pulumi.Output<k8s.types.input.core.v1.EnvVarSource> {
        return pulumi.output({
            configMapKeyRef: {
                name: this.metadata.name,
                key: key,
            },
        });
    }
}

export class Secret extends k8s.core.v1.Secret {
    constructor(name: string, args: k8s.types.input.core.v1.Secret, opts?: pulumi.CustomResourceOptions) {
        super(name, args, opts);
    }

    public mount(destPath: pulumi.Input<string>, srcPath?: pulumi.Input<string>): pulumi.Output<types.VolumeMount> {
        return pulumi.output({
            volume: {
                name: this.metadata.name,
                secret: {
                    secretName: this.metadata.name,
                    // TODO: items
                },
            },
            destPath: destPath,
            srcPath: srcPath,
        });
    }

    public asEnvValue(key: pulumi.Input<string>): pulumi.Output<k8s.types.input.core.v1.EnvVarSource>  {
        return pulumi.output({
            secretKeyRef: {
                name: this.metadata.name,
                key: key,
            },
        });
    }
}
