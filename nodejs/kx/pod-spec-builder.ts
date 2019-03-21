import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as input from "@pulumi/kubernetes/types/input";
import * as vol from "./volume";
import * as ds from "./docker-secret";
import * as utils from "./utils";
import * as crypto from "crypto";

// Omit<Container, "name"> creates a new type with all of the fields in `Container`, except `name`.
// e.g. Omit a prop all-together:
//      Omit<input.core.v1.PodSpec, "containers">
// or, replace a prop with a new one:
//      Omit<input.core.v1.PodSpec, "containers"> & { container: input.core.v1.Container },
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

type Mounts = { [containerName: string]: string | Omit<input.core.v1.VolumeMount, "name"> };

// Allows users to re-name a key before it is placed into the `ConfigMap` by
// providing a manual mapping can be supplied as a dictionary (e.g.,
// { "renameMe": "toThis" }) or a function that provides a mapping (e.g.,
// path => path === "renameMe": "toThis" : path).
type KeyMap = { [key: string]: string } | ((key: string) => string);

interface Mountable {
    mount(partialPodSpec: PartialPodSpec, mount: Mounts): PartialPodSpec;
}

function isMountable(arg: any): arg is Mountable {
    return arg.mount !== undefined;
}

export class ConfigMap extends k8s.core.v1.ConfigMap implements Mountable {
    constructor(
        name: string,
        args: input.core.v1.ConfigMap,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super(name, args, opts);
    }

    // Mount the ConfigMap onto the mount provided of the PartialPodSpec.
    public mount(partialPodSpec: PartialPodSpec, mount: Mounts): PartialPodSpec {
        return partialPodSpec.addMount(this, mount);
    }

    /*
    // Create ConfigMap with a K/V pair for each file in the directory. `keyMapFunc` can optionally
    // rename these keys.
    static fromDirectory(
        name: string,
        path: string,
        recursive?: boolean,
        keyMap?: KeyMap,
    ): ConfigMap {
        throw Error();
    }
    */

    // Create ConfigMap containing a single file, `nginx.conf`. We map that
    // filename to "nginx.conf" to "nginx".
    //
    // ConfigMap.fromFile("nginx.conf", { "nginx.conf": "nginx" })
    static fromFiles(name: string, files: string | string[], keyMap?: KeyMap): ConfigMap {
        throw Error();
    }

    /*
    // Create ConfigMap whose data consists of the env file mapping:
    //
    // ConfigMap.fromEnvFile("my-env-file.txt")
    static fromEnvFile(name: string, file: string, keyMap?: KeyMap): ConfigMap {
        throw Error();
    }
    */

    /*
    // Create ConfigMap whose data consists of the env file mapping:
    //
    // ConfigMap.fromUrls("gist.githubusercontent.com/hausdorff/deadbeef/mydata")
    static fromUrls(name: string, url: string | string[], keyMap?: KeyMap): ConfigMap {
        throw Error();
    }
    */
}

function isConfigMap(arg: any): arg is k8s.core.v1.ConfigMap {
    return (<k8s.core.v1.ConfigMap>arg).kind !== undefined;
}

function isOmitVolumeMount(arg: any): arg is Omit<input.core.v1.VolumeMount, "name"> {
    return (<Omit<input.core.v1.VolumeMount, "name">>arg).mountPath !== undefined;
}

// Implements a template for a partial PodSpec, that is intended to be merged into a 
// single, overarching input.core.v1.PodSpec.
//
// The type can either be:
// - A PodSpec where the prop:
//   - spec.initContainers has been replaced with only 1 spec.initContainer,
//   and 0 containers as its been removed.
//  or
// - A PodSpec where the prop:
//   - spec.containers has been replaced with only 1 spec.container, 
//   and 0 initContainers as its been removed.
type PartialPodSpecTemplate =
	| Omit<
	Omit<input.core.v1.PodSpec, "containers"> & { container: input.core.v1.Container },
	"initContainers"
	>
	| Omit<
	Omit<input.core.v1.PodSpec, "initContainers"> & {
		initContainer: input.core.v1.Container;
	},
	"containers"
	>;

// Pulumi namespace for the new PartialPodSpec pulumi.ComponentResource
const partialPodSpecNamespace: string = "pulumi:kx:PartialPodSpec";

export class PartialPodSpec extends pulumi.ComponentResource {
    public readonly partialPodSpec: PartialPodSpecTemplate;

    constructor(
        name: string,
        args: PartialPodSpecTemplate,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(partialPodSpecNamespace, name, args, opts);

        if (args === undefined) {
            return {} as PartialPodSpec;
        }

        this.partialPodSpec = args;
        let pps = (<any>this.partialPodSpec);

        // Init spec.volumes.
        if (pps.volumes === undefined) {
            pps.volumes = [];
        }

        // Add DownwardAPI environment variables to the initContainer.
        if (pps.initContainer !== undefined) {
            vol.addEnvVars(vol.downwardApiEnvVars, [pps.initContainer]);

            // Mount the Downward API volume to the mount path.
            this.addMount(vol.downwardApiVolume, {[pps.initContainer.name]: "/etc/podinfo"});
        }

        // Add DownwardAPI environment variables to the container.
        if (pps.container !== undefined) {
            vol.addEnvVars(vol.downwardApiEnvVars, [pps.container]);

            // Mount the Downward API volume to the mount path.
            this.addMount(vol.downwardApiVolume, {[pps.container.name]: "/etc/podinfo"});
        }

    }

    public addMount(
        mountable: Omit<input.core.v1.Volume, "name"> | Mountable,
        mounts: Mounts,
    ): PartialPodSpec {
        let pps = (<any>this.partialPodSpec);
        if (pps === undefined) {
            return this;
        }

        let mountVolume = {} as Omit<input.core.v1.Volume, "name">;

        // Mount the volume to the container's mount path.
        switch (isMountable(mountable)){
            case true: {
                if (isConfigMap(mountable)){
                    mountVolume = {
                        configMap: {
                            name: mountable.metadata.apply(m => m.name),
                        }
                    }
                }
                break;
            }
            case false: {
                mountVolume = (<Omit<input.core.v1.Volume, "name">>mountable);
                break;
            }
        };

        for (let containerName of Object.keys(mounts)) {
            let mount = mounts[containerName];
            let mountPath: pulumi.Input<string>;

            if (isOmitVolumeMount(mount)) {
                mountPath = mount.mountPath;
            } else {
                mountPath = mount;
            }

            let mountName = utils.createDnsString(JSON.stringify(mountPath));

            if ("initContainer" in pps && pps.initContainer.name === containerName) {
                vol.addVolume(mountName, mountVolume, pps.volumes);
                vol.addVolumeMount(mountName, mountPath, [pps.initContainer]);
            } else if ("container" in pps && pps.container.name === containerName) {
                vol.addVolume(mountName, mountVolume, pps.volumes);
                vol.addVolumeMount(mountName, mountPath, [pps.container]);
            }
        }
        return this;
    }

    /*
    static fromContainer(container: input.core.v1.Container): PartialPodSpec {
        throw Error();
    }
    */
}

// Pulumi namespace for the new PodSpecBuilder pulumi.ComponentResource
const podSpecBuilderNamespace: string = "pulumi:kx:PodSpecBuilder";
export class PodSpecBuilder extends pulumi.ComponentResource {
    public readonly podSpecBuilder: input.core.v1.PodSpec;

    constructor(
        name: string,
        args: PartialPodSpec[],
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(podSpecBuilderNamespace, name, args, opts);

        if (args === undefined) {
            return {} as PodSpecBuilder;
        }

        this.podSpecBuilder = PodSpecBuilder.fromPartialPodSpecs(args);

        /*
        public configData: input.core.v1.ConfigMap;

        constructor(public pod: input.core.v1.PodSpec) {}

        public mountConfigMap(config: k8s.core.v1.ConfigMap, mounts: Mounts): PodSpecBuilder {
            return this;
        }

        public mountVolume(volume: Omit<input.core.v1.Volume, "name">, mounts: Mounts): PodSpecBuilder {
            return this;
        }

        public addMountsToContainer(mounts: any, containerName: string) {}
         */
    }

    static fromPartialPodSpecs(partialPodSpecs: PartialPodSpec[]): input.core.v1.PodSpec {
        let initContainers: any[] = [];
        let containers: any[] = [];
        let volumes: any[] = [];

        if (partialPodSpecs === undefined ||
            partialPodSpecs.length == 0){
            return {} as input.core.v1.PodSpec;
        }

        // Form the base of the new, aggregate PodSpec, which will
        // merge the PartialPodSpecs.
        //
        // Currently, we use a simple policy to determine which
        // PartialPodSpec's props are set in the new, aggregate PodSpec.
        //
        // The policy is that the first PartialPodSpec in the array will
        // dictate the aggregate PodSpec props set. All other PartialPodSpecs
        // will only be used to extract and slot the container within (see below)
        // appropriately in the aggregate PodSpec. Any other props will not
        // be regarded. This inherently means, the user *must* use the first
        // elem of the array to determine which PartialPodSpec props get used.
        let podSpec: any = {...partialPodSpecs[0].partialPodSpec};
        delete podSpec['initContainer'];
        delete podSpec['container'];
        delete podSpec['volumes'];

        // Slot the container of each PartialPodSpec into their proper group
        // in the aggregate PodSpec.
        for (let pps of partialPodSpecs) {
            if ('initContainer' in pps.partialPodSpec) {
                initContainers.push(pps.partialPodSpec.initContainer);
            }
            if ('container' in pps.partialPodSpec) {
                containers.push(pps.partialPodSpec.container);
            }

            // Merge the volumes of each PartialPodSpec into the aggregate PodSpec.
            volumes = volumes.concat(pps.partialPodSpec.volumes);
        }

        podSpec.initContainers = initContainers;
        podSpec.containers = containers;
        podSpec.volumes = volumes;

        return <input.core.v1.PodSpec>podSpec;
    }
}

export type PartialDeploymentSpecTemplate = 
    Omit<input.apps.v1.DeploymentSpec, "selector" | "template"> & 
    {template: {spec: PartialPodSpec[]}};

export type DeploymentSpecBuilder =
    Omit<input.apps.v1.Deployment, "spec"> & {spec: PartialDeploymentSpecTemplate};

export class Deployment extends k8s.apps.v1.Deployment {
    static fromPartialPodSpecs(
        name: string,
        args: DeploymentSpecBuilder,
        opts: pulumi.CustomResourceOptions,
    ) {

        if (args === undefined ||
            opts === undefined) {
            return {} as k8s.apps.v1.Deployment;
        }

        let deployArgs = (<any>args);

        // Create PodSpecBuilder from PartialPodSpecs.
        let podSpecBuilder: input.core.v1.PodSpec =
            PodSpecBuilder.fromPartialPodSpecs(deployArgs.spec.template.spec);

        // Form the DeploymentSpec from the args and PodSpecBuilder.
        let deploySpec: any = {...deployArgs.spec};
        deploySpec.selector = {matchLabels: deployArgs.metadata.labels},
        deploySpec.template = {
            metadata: deployArgs.metadata,
            spec: podSpecBuilder,
        }

        // Form the Deployment from the args and DeploymentSpec.
        let deploy: input.apps.v1.Deployment = {
            metadata: deployArgs.metadata,
            spec: deploySpec,
        };

        // Create a new Deployment.
        return new k8s.apps.v1.Deployment(
            name,
            deploy,
            {provider: opts.provider},
        );
    }
}

/*
// PodBuilder implements a Kubernetes Pod, with the specified PodBuilderArgs.
export class PodBuilder extends pulumi.ComponentResource {
    public readonly podBuilderName: string;
    public readonly podBuilderProvider: k8s.Provider;
    public readonly podBuilder: input.core.v1.Pod;

    constructor(
        name: string,
        provider: k8s.Provider,
        args: PodBuilderArgs,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponentNamespace, name, args, opts);

        if (args === undefined ||
            provider === undefined) {
            return {} as PodBuilder;
        }

        this.podBuilderName = name;
        this.podBuilderProvider = provider;

        // Create the podBuilder base.
        this.podBuilder = {spec: args.podSpec};

        let pb = (<any>this.podBuilder);
        if (pb.spec.initContainers === undefined) {
            pb.spec.initContainers = [];
        }
        if (pb.spec.volumes === undefined) {
            pb.spec.volumes = [];
        }

        // Add Downward API environment variables to containers.
        vol.addEnvVars(vol.downwardApiEnvVars, pb.spec.initContainers);
        vol.addEnvVars(vol.downwardApiEnvVars, pb.spec.containers);

        // Mount the Downward API volume to the mount path.
        this.mountVolume( "/etc/podinfo", vol.downwardApiVolume);
    }

    // The options for the Pod's manifest metadata
    public withMetadata(
        metadata: input.meta.v1.ObjectMeta,
    ) {
        let pb = (<any>this.podBuilder);
        pb.metadata = metadata;
        return this;
    };

    // Add Docker Registry creds to pull down private container images.
    public addImagePullSecrets(
        dockerConfigJson?: string,
    ) {
        if (dockerConfigJson === undefined) {
            return this;
        }

        let pb = (<any>this.podBuilder);

        // Create a new Secret
        const dockerSecret = new ds.DockerSecretBuilder(
            this.podBuilderName,
            this.podBuilderProvider,
            {
                labels: pb.metadata.labels,
                namespace: pb.metadata.namespace,
                dockerConfigJson: dockerConfigJson,
            },
        );

        // Create a new Secret from the DockerSecretBuilder.
        let secret = dockerSecret.toSecret();
        let secretName = secret.metadata.apply(m => m.name);

        // Add the Secret to the imagePullSecrets.
        if (pb.spec.imagePullSecrets === undefined ) {
            pb.spec.imagePullSecrets = [];
        }
        pb.spec.imagePullSecrets.push({ name: secretName});

        return this;
    };

    // Adds environment variables from a ConfigMap into the initContainers
    // and containers of the the Pod.
    public addEnvVarsFromConfigMap (
        configMapName: pulumi.Input<string>,
    ) {
        let initContainers = (<any>this.podBuilder).spec.initContainers;
        let containers = (<any>this.podBuilder).spec.containers;

        if (initContainers !== undefined) {
            if (initContainers.envFrom === undefined) {
                initContainers.envFrom = [];
            }
            vol.addEnvVarsFromConfigMap(configMapName, initContainers);
        }

        if (containers !== undefined) {
            if (containers.envFrom === undefined) {
                containers.envFrom = [];
            }
            vol.addEnvVarsFromConfigMap(configMapName, containers);
        }

        return this;
    };

    // Adds environment variables from a Secret into the initContainers
    // and containers of the the Pod.
    public addEnvVarsFromSecret (
        secretName: pulumi.Input<string>,
    ) {
        let initContainers = (<any>this.podBuilder).spec.initContainers;
        let containers = (<any>this.podBuilder).spec.containers;

        if (initContainers !== undefined) {
            if (initContainers.envFrom === undefined) {
                initContainers.envFrom = [];
            }
            vol.addEnvVarsFromSecret(secretName, initContainers);
        }

        if (containers !== undefined) {
            if (containers.envFrom === undefined) {
                containers.envFrom = [];
            }
            vol.addEnvVarsFromSecret(secretName, containers);
        }

        return this;
    };

    // Adds environment variables into the initContainers and containers of
    // the the Pod.
    public addEnvVar (
        environmentVar: input.core.v1.EnvVar,
    ) {
        let initContainers = (<any>this.podBuilder).spec.initContainers;
        let containers = (<any>this.podBuilder).spec.containers;

        if (initContainers !== undefined) {
            if (initContainers.env === undefined) {
                initContainers.env = [];
            }
            vol.addEnvVar(environmentVar, initContainers);
        }

        if (containers !== undefined) {
            if (containers.env === undefined) {
                containers.env = [];
            }
            vol.addEnvVar(environmentVar, containers);
        }

        return this;
    };

    // Adds a volume to a mountPath on the containers.
    public mountVolume (
        mountPath: string,
        volume: input.core.v1.Volume,
    ) {
        let initContainers = (<any>this.podBuilder).spec.initContainers;
        let containers = (<any>this.podBuilder).spec.containers;
        let volumes = (<any>this.podBuilder).spec.volumes;

        if (initContainers === undefined ||
            containers === undefined) {
            return this;
        }

        // Mount the volume to the container's mount path.
        vol.addVolumeMount(volume.name, mountPath, [...initContainers, ...containers]);

        // Add the volumes to the volumes group of the Pod
        vol.addVolume(volume, volumes);

        return this;
    };

    // Adds an initContainer to the Pod.
    // This is an array of containers that operates as an in-order chain. All
    // initContainers must successfully exit before the Pods's containers run.
    public addInitContainer (
        initContainer: input.core.v1.Container,
    ) {
        let initContainers = (<any>this.podBuilder).spec.initContainers;

        if (initContainers === undefined) {
            initContainers = [];
        }

        // Add Downward API environment variables to containers.
        vol.addEnvVars(vol.downwardApiEnvVars, [initContainer]);

        // Mount the Downward API volume to the mount path.
        vol.addVolumeMount(vol.downwardApiVolume.name, "/etc/podinfo", [initContainer]);

        initContainers.push(initContainer);

        return this;
    };

    // Adds a sidecar to the Pod.
    public addSidecar (
        container: input.core.v1.Container,
    ) {
        let containers = (<any>this.podBuilder).spec.containers;

        if (containers === undefined) {
            return this;
        }

        // Add Downward API environment variables to containers.
        vol.addEnvVars(vol.downwardApiEnvVars, [container]);

        // Mount the Downward API volume to the mout path.
        vol.addVolumeMount(vol.downwardApiVolume.name, "/etc/podinfo", [container]);

        containers.push(container);

        return this;
    };

    // Create a new Pod resource (output type) from the PodBuilder in k8s.
    public createPod(): k8s.core.v1.Pod {
        return new k8s.core.v1.Pod(
            this.podBuilderName,
            this.podBuilder,
            {provider: this.podBuilderProvider},
        );
    };

    // Create a new Job resource (output type) from the PodBuilder in k8s.
    public createJob(
        name: string,
        jobArgs?: JobBuilderArgs,
    ): k8s.batch.v1.Job {
        const jobBuilder = makeJobBuilderBase(this.podBuilder, jobArgs);
        return new k8s.batch.v1.Job(
            name,
            jobBuilder,
            {provider: this.podBuilderProvider},
        );
    };

    // Create a new CronJob resource (output type) from the PodBuilder in k8s.
    public createCronJob(
        name: string,
        cronJobArgs?: CronJobBuilderArgs,
    ): k8s.batch.v1beta1.CronJob {
        const cronJobBuilder = makeCronJobBuilderBase(this.podBuilder, cronJobArgs);
        return new k8s.batch.v1beta1.CronJob(
            name,
            cronJobBuilder,
            {provider: this.podBuilderProvider},
        );
    };

    // Create a new Deployment from the PodBuilder.
    public createDeployment(
        name: string,
        deploymentArgs?: DeploymentBuilderArgs,
    ): k8s.apps.v1.Deployment {
        const deployBuilder = makeDeploymentBuilderBase(this.podBuilder, deploymentArgs);
        return new k8s.apps.v1.Deployment(
            name,
            deployBuilder,
            {provider: this.podBuilderProvider},
        );
    };

    // Create a new ReplicaSet from the PodBuilder.
    public createReplicaSet(
        name: string,
        replicaSetArgs?: ReplicaSetBuilderArgs,
    ): k8s.apps.v1.ReplicaSet {

        const replicaSetBuilder = makeReplicaSetBuilderBase(this.podBuilder, replicaSetArgs);
        return new k8s.apps.v1.ReplicaSet(
            name,
            replicaSetBuilder,
            {provider: this.podBuilderProvider},
        );
    };

    // Create a new DaemonSet from the PodBuilder.
    public createDaemonSet(
        name: string,
        daemonSetArgs?: DaemonSetBuilderArgs,
    ): k8s.extensions.v1beta1.DaemonSet {

        const daemonSetBuilder = makeDaemonSetBuilderBase(this.podBuilder, daemonSetArgs);
        return new k8s.extensions.v1beta1.DaemonSet(
            name,
            daemonSetBuilder,
            {provider: this.podBuilderProvider},
        );
    };
}
*/


/*
// Create a base manifest for a Kubernetes Job.
export function makeJobBuilderBase(
    podBuilder: input.core.v1.Pod,
    jobBuilderArgs?: JobBuilderArgs,
): input.batch.v1.Job {
    if (podBuilder === undefined) {
        return {} as input.batch.v1.Job;
    }

    let pb = (<any>podBuilder);

    let backoffLimit, activeDeadlineSeconds;
    if (jobBuilderArgs !== undefined) {
        backoffLimit = jobBuilderArgs.backoffLimit;
        activeDeadlineSeconds = jobBuilderArgs.activeDeadlineSeconds;
    }

    return {
        metadata: {
            labels: pb.metadata.labels,
            namespace: utils.objOrDefault(pb.metadata.namespace, "default"),
        },
        spec: {
            backoffLimit: utils.objOrDefault(backoffLimit, 6), // # of retries before the Job fails.
            activeDeadlineSeconds: utils.objOrDefault(activeDeadlineSeconds, 600), // max time before termination.
            template: {
                metadata: pulumi.output(pb.metadata),
                spec: pulumi.output(pb.spec),
            },
        },
    };
}

// Create a base manifest for a Kubernetes CronJob.
export function makeCronJobBuilderBase(
    podBuilder: input.core.v1.Pod,
    cronJobArgs?: CronJobBuilderArgs,
): input.batch.v1beta1.CronJob {
    if (podBuilder === undefined) {
        return {} as input.batch.v1beta1.CronJob;
    }

    let pb = (<any>podBuilder);

    let backoffLimit, schedule, successfulJobsHistoryLimit;
    let failedJobsHistoryLimit, activeDeadlineSeconds;
    if (cronJobArgs !== undefined) {
        schedule = cronJobArgs.schedule;
        backoffLimit = cronJobArgs.jobBuilderArgs.backoffLimit;
        successfulJobsHistoryLimit = cronJobArgs.successfulJobsHistoryLimit;
        failedJobsHistoryLimit = cronJobArgs.failedJobsHistoryLimit;
        activeDeadlineSeconds = cronJobArgs.jobBuilderArgs.activeDeadlineSeconds;
    }

    return {
        metadata: {
            labels: pb.metadata.labels,
            namespace: utils.objOrDefault(pb.metadata.namespace, "default"),
        },
        spec: {
            schedule: utils.objOrDefault(schedule, ""),
            successfulJobsHistoryLimit: utils.objOrDefault(successfulJobsHistoryLimit, 3),
            failedJobsHistoryLimit: utils.objOrDefault(failedJobsHistoryLimit, 1),
            jobTemplate: {
                spec: {
                    backoffLimit: utils.objOrDefault(
                        backoffLimit, 6), // # of retries before the Job fails.
                    activeDeadlineSeconds: utils.objOrDefault(
                        activeDeadlineSeconds, 600), // max time before termination.
                    template: {
                        metadata: pulumi.output(pb.metadata),
                        spec: pulumi.output(pb.spec),
                    },
                },
            },
        },
    };
}
*/
/*

// Create a base manifest for a Kubernetes Deployment.
export function makeDeploymentBuilderBase(
    podBuilder: PodBuilderSpec,
    deploymentArgs?: DeploymentBuilderArgs,
): input.apps.v1.Deployment {
    if (podBuilder === undefined) {
        return {} as input.apps.v1.Deployment;
    }

    let pb = (<any>podBuilder);

    let replicas;
    if (deploymentArgs !== undefined) {
        replicas = deploymentArgs.replicas;
    }

    return {
        metadata: {
            labels: pb.metadata.labels,
            namespace: utils.objOrDefault(pb.metadata.namespace, "default"),
        },
        spec: {
            replicas: utils.objOrDefault(replicas, 1),
            selector: { matchLabels: pb.metadata.labels },
            template: {
                metadata: pulumi.output(pb.metadata),
                spec: pulumi.output(pb.spec),
            },
        },
    };
}
*/

/*
// Create a base manifest for a Kubernetes ReplicaSet.
export function makeReplicaSetBuilderBase(
    podBuilder: input.core.v1.Pod,
    replicaSetArgs?: ReplicaSetBuilderArgs,
): input.apps.v1.ReplicaSet {
    if (podBuilder === undefined) {
        return {} as input.apps.v1.ReplicaSet;
    }

    let pb = (<any>podBuilder);

    let replicas;
    if (replicaSetArgs !== undefined) {
        replicas = replicaSetArgs.replicas;
    }

    return {
        metadata: {
            labels: pb.metadata.labels,
            namespace: utils.objOrDefault(pb.metadata.namespace, "default"),
        },
        spec: {
            replicas: utils.objOrDefault(replicas, 1),
            selector: { matchLabels: pb.metadata.labels },
            template: {
                metadata: pulumi.output(pb.metadata),
                spec: pulumi.output(pb.spec),
            },
        },
    };
}

// Create a base manifest for a Kubernetes DaemonSet.
export function makeDaemonSetBuilderBase(
    podBuilder: input.core.v1.Pod,
    daemonSetArgs?: DaemonSetBuilderArgs,
): input.extensions.v1beta1.DaemonSet {
    if (podBuilder === undefined) {
        return {} as input.extensions.v1beta1.DaemonSet;
    }

    let pb = (<any>podBuilder);

    let minReadySeconds;
    let revisionHistoryLimit;
    let updateStrategy;
    if (daemonSetArgs !== undefined) {
        minReadySeconds = daemonSetArgs.minReadySeconds;
        revisionHistoryLimit = daemonSetArgs.revisionHistoryLimit;
        updateStrategy = daemonSetArgs.updateStrategy;
    }

    return {
        metadata: {
            labels: pb.metadata.labels,
            namespace: utils.objOrDefault(pb.metadata.namespace, "default"),
        },
        spec: {
            minReadySeconds: utils.objOrDefault(minReadySeconds, 0),
            revisionHistoryLimit: utils.objOrDefault(revisionHistoryLimit, 10),
            updateStrategy: {type: utils.objOrDefault(updateStrategy, "RollingUpdate")},
            selector: { matchLabels: pb.metadata.labels },
            template: {
                metadata: pulumi.output(pb.metadata),
                spec: pulumi.output(pb.spec),
            },
        },
    };
}
*/
