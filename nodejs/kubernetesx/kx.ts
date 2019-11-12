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

export namespace types {
    export type EnvMap = Record<string, pulumi.Input<string | k8s.types.input.core.v1.EnvVarSource>>;
    export type PortMap = Record<string, pulumi.Input<number>>;

    export enum ServiceType {
        ClusterIP = "ClusterIP",
        LoadBalancer = "LoadBalancer",
    }
    export type ServiceArgs = {
        type?: pulumi.Input<types.ServiceType>,
        ports?: pulumi.Input<types.PortMap>,
        selector?: pulumi.Input<{[key: string]: pulumi.Input<string>}>,
    };

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
    export type PodSpec = Omit<k8s.types.input.core.v1.PodSpec, "containers"> & {
        containers: pulumi.Input<pulumi.Input<Container>[]>,
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
    export type PodBuilderJobSpec = Omit<k8s.types.input.batch.v1.JobSpec, "template">;
    export type Job = Omit<k8s.types.input.batch.v1.Job, "spec"> & {
        spec: pulumi.Input<JobSpec | k8s.types.input.batch.v1.JobSpec>,
    };
}

function buildPodSpec(args: pulumi.Input<types.PodSpec>): pulumi.Output<k8s.types.input.core.v1.PodSpec> {
    return pulumi.output<types.PodSpec>(args).apply(podSpec => {
        const containers: k8s.types.input.core.v1.Container[] = [];
        const volumes: k8s.types.input.core.v1.Volume[] = [];
        const isEnvMap = (env: any): env is pulumi.UnwrappedObject<types.EnvMap> => env.length === undefined;
        const isPortMap = (ports: any): ports is pulumi.UnwrappedObject<types.PortMap> => ports.length === undefined;
        const isMountObject = (object: any): object is pulumi.UnwrappedObject<types.VolumeMount> => object.hasOwnProperty("volume");
        podSpec.containers.forEach(container => {
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
            containers.push(c);
        });
        return pulumi.output({
            ...podSpec,
            containers: containers,
            volumes: [
                ...podSpec.volumes || [],
                ...volumes,
            ],
        });
    });
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

    public asDeploymentSpec(args?: {replicas?: number}): pulumi.Output<k8s.types.input.apps.v1.DeploymentSpec> {
        const appLabels = { app: this.podName };
        const deploymentSpec: k8s.types.input.apps.v1.DeploymentSpec = {
            selector: { matchLabels: appLabels },
            replicas: args && args.replicas || 1,
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

    // TODO: will want to create input type based on ServiceSpec
    public createService(args?: {type?: pulumi.Input<types.ServiceType | string>}) {
        const serviceSpec = this.spec.template.spec.containers.apply(containers => {
            const ports: Record<string, number> = {};
            containers.forEach(container => {
                container.ports.forEach(port => {
                    ports[port.name] = port.containerPort;
                });
            });
            return {
                ports: ports,
                selector: this.spec.selector.matchLabels,
                // TODO: probably need to unwrap args.type in case it's a computed value
                type: args && args.type as string,
            };
        });

        return new Service(this.name, {
            spec: serviceSpec,
        }, {...this.opts, parent: this});
    }
}

export class Service extends k8s.core.v1.Service {
    constructor(name: string, args: types.Service, opts?: pulumi.CustomResourceOptions) {

        const spec = pulumi.output(args)
            .apply((args: pulumi.UnwrappedObject<types.Service>) => {
                const isPortMap = (ports: any): ports is types.PortMap => ports.length === undefined;

                const ports: k8s.types.input.core.v1.ServicePort[] = [];
                const portsArg = args.spec.ports;
                if (portsArg) {
                    if (isPortMap(portsArg)) {
                        Object.keys(portsArg).forEach(key => {
                            const value = portsArg[key];
                            ports.push({name: key, port: value});
                        });
                    } else {
                        ports.concat(...portsArg);
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

        const serviceSpec = statefulSet.spec.template.spec.containers.apply(containers => {
            const ports: Record<string, number> = {};
            containers.forEach(container => {
                container.ports.forEach(port => {
                    ports[port.name] = port.containerPort;
                });
            });
            return {
                ports: ports,
                selector: statefulSet.spec.selector.matchLabels,
                clusterIP: "None",
            };
        });

        const service = new Service(
            name, {
                metadata: {
                    name: `${name}-service`,
                },
                spec: serviceSpec,
            }, {...opts, parent: this});

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
