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
    export type EnvMap = Record<string, pulumi.Input<string | k8s.types.input.core.v1.EnvVarSource>>
    export type PortMap = Record<string, pulumi.Input<number>>

    export enum ServiceType {
        ClusterIP = "ClusterIP",
        LoadBalancer = "LoadBalancer",
    }
    export type ServiceArgs = {
        type?: pulumi.Input<types.ServiceType>,
        ports?: pulumi.Input<types.PortMap>,
        selector?: pulumi.Input<{[key: string]: pulumi.Input<string>}>,
    }

    export type VolumeMount = {
        volume: pulumi.Input<k8s.types.input.core.v1.Volume>,
        destPath: pulumi.Input<string>,
        srcPath?: pulumi.Input<string>,
    }
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
        spec: pulumi.Input<PodSpec>,
    };
    export type DeploymentSpec = Omit<k8s.types.input.apps.v1.DeploymentSpec, "template"> & {
        template: pulumi.Input<Pod>,
    };
    export type Deployment = Omit<k8s.types.input.apps.v1.Deployment, "spec"> & {
        spec: pulumi.Input<DeploymentSpec>,
    };
    export type StatefulSetSpec = Omit<k8s.types.input.apps.v1.StatefulSetSpec, "template"> & {
        template: pulumi.Input<Pod>,
    };
    export type StatefulSet = Omit<k8s.types.input.apps.v1.StatefulSet, "spec"> & {
        spec: pulumi.Input<StatefulSetSpec>,
    };
}

function buildPodSpec(args: pulumi.Input<types.PodSpec>): pulumi.Output<k8s.types.input.core.v1.PodSpec> {
    return pulumi.output<types.PodSpec>(args).apply(podSpec => {
        let containers: k8s.types.input.core.v1.Container[] = [];
        const volumes: k8s.types.input.core.v1.Volume[] = [];
        const isEnvMap = (env: any): env is pulumi.UnwrappedObject<types.EnvMap> => env.length === undefined;
        const isPortMap = (ports: any): ports is pulumi.UnwrappedObject<types.PortMap> => ports.length === undefined;
        const isMountObject = (object: any): object is pulumi.UnwrappedObject<types.VolumeMount> => object.hasOwnProperty("volume");
        podSpec.containers.forEach(container => {
            let c: pulumi.UnwrappedObject<k8s.types.input.core.v1.Container> = {
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
                let result = re.exec(imageArg);
                if (!result) {
                    throw new Error('Failed to parse image name from ' + imageArg)
                }
                c.name = result[2];
            }
            const env = container.env;
            if (env) {
                if (isEnvMap(env)) {
                    Object.keys(env).forEach(key => {
                        const value = env[key];
                        if (typeof value === "string") {
                            c.env!.push({name: key, value: value})
                        } else {
                            c.env!.push({name: key, ...value})
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
            containers.push(c)
        });
        return pulumi.output({
            containers: containers,
            volumes: [
                ...podSpec.volumes || [],
                ...volumes,
            ],
        });
    });
}

export class PodBuilder {
    public pod: pulumi.Output<k8s.types.input.core.v1.PodSpec>;
    constructor(args: types.PodSpec) {
        this.pod = buildPodSpec(args)
    }
}

export class Pod extends k8s.core.v1.Pod {
    constructor(name: string, args: types.Pod, opts?: pulumi.CustomResourceOptions) {
        super(name,
            {
                ...args,
                spec: buildPodSpec(args.spec),
            },
            opts);
    }
}

// export class Deployment extends k8s.apps.v1.Deployment {
//     constructor(name: string, args: types.Deployment, opts?: pulumi.CustomResourceOptions) {
//         const spec: pulumi.Output<k8s.types.input.apps.v1.DeploymentSpec> = pulumi.output<types.Deployment>(args)
//             .apply(args => {
//                 const podSpec = buildPodSpec(args.spec.template);
//                 return pulumi.output({
//                     ...args.spec,
//                     template: {
//                         ...args.spec.template,
//                         spec: podSpec
//                     }
//                 })
//             });
//
//         super(name,
//             {
//                 ...args,
//                 spec: spec,
//             },
//             opts);
//     }
// }
//
// export class StatefulSet extends k8s.apps.v1.StatefulSet {
//     constructor(name: string, args: types.StatefulSet, opts?: pulumi.CustomResourceOptions) {
//         const spec: pulumi.Output<k8s.types.input.apps.v1.StatefulSetSpec> = pulumi.output<types.StatefulSet>(args)
//             .apply(args => {
//                 const podSpec = buildPodSpec(args.spec.template);
//                 return pulumi.output({
//                     ...args.spec,
//                     template: {
//                         ...args.spec.template,
//                         spec: podSpec
//                     }
//                 })
//             });
//
//         super(name,
//             {
//                 ...args,
//                 spec: spec,
//             },
//             opts);
//     }
//
//     public createService(name: string, args?: types.ServiceArgs): k8s.core.v1.Service {
//
//         // TODO: pull this into a function if possible
//         const spec: pulumi.Output<k8s.types.input.core.v1.ServiceSpec> = pulumi.output<types.ServiceArgs>(args)
//             .apply(args => {
//                 let type: string = types.ServiceType.ClusterIP;
//                 let ports: k8s.types.input.core.v1.ServicePort[] = [];
//                 if (args) {
//                     if (args.type) {
//                         type = args.type;
//                     }
//                     if (args.ports) {
//                         const portArgs = args.ports;
//                         Object.keys(portArgs).forEach(name => {
//                             const port = portArgs[name];
//                             ports.push({
//                                 name: name,
//                                 port: port,
//                                 targetPort: name,
//                             });
//                         });
//                     }
//                 }
//                 return pulumi.output({
//                     type: type,
//                     ports: ports,
//                     selector: this.spec.template.metadata.labels,
//                 });
//             });
//
//         // TODO: create service automatically for STS
//         // StatefulSet should probably be a ComponentResource that includes a headless Service
//         return new k8s.core.v1.Service(name, {
//             metadata: this.metadata.apply(m => {
//                 delete m.annotations['pulumi.com/autonamed'];
//                 delete m.annotations['kubectl.kubernetes.io/last-applied-configuration'];
//                 return {
//                     annotations: m.annotations,
//                     labels: m.labels,
//                     name: this.spec.serviceName,
//                 }
//             }),
//             spec: spec,
//         })
//     }
// }

export class PersistentVolumeClaim extends k8s.core.v1.PersistentVolumeClaim {
    constructor(name: string, args: k8s.types.input.core.v1.PersistentVolumeClaim, opts?: pulumi.CustomResourceOptions) {
        super(name, args, opts)
    }

    // TODO: define input type?
    public mount(destPath: pulumi.Input<string>, srcPath?: pulumi.Input<string>): pulumi.Output<types.VolumeMount> {
        return pulumi.output({
            volume: {
                name: this.metadata.name,
                persistentVolumeClaim: {
                    claimName: this.metadata.name,
                }
            },
            destPath: destPath,
            srcPath: srcPath,
        })
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
        })
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
                }
            },
            destPath: destPath,
            srcPath: srcPath,
        })
    }

    public asEnvValue(key: pulumi.Input<string>): pulumi.Output<k8s.types.input.core.v1.EnvVarSource> {
        return pulumi.output({
            valueFrom: {
                secretKeyRef: {
                    name: this.metadata.name,
                    key: key
                }
            }
        })
    }
}
