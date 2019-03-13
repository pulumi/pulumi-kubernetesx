import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as input from "@pulumi/kubernetes/types/input";
import * as vol from "./volume";
import * as ds from "./docker-secret";
import * as utils from "./utils";

// Pulumi namespace for the new PodBuilder pulumi.ComponentResource
const pulumiComponentNamespace: string = "pulumi:kx:PodBuilder";

// PodBuilderArgs implements the spec settings for a Kubernetes Pod.
export type PodBuilderArgs = {
    // The spec of the Pod.
    podSpec: input.core.v1.PodSpec;
};

// JobBuilderArgs implements the spec settings for a Kubernetes Job.
export type JobBuilderArgs = {
    // The number of retries before marking the job as failed. Defaults to 6.
    backoffLimit?: pulumi.Input<number>;

    // The max time the CronJob can run before being terminated. Defaults to 10
    // minutes.
    activeDeadlineSeconds?: pulumi.Input<number>;
};

// CronJobBuilderArgs implements the spec settings for a Kubernetes CronJob.
export type CronJobBuilderArgs = {
    // The Cron scheduling extended format. k8s uses the standard 5-field format.
    schedule: string,

    // The number of successful finished jobs to retain. This is a pointer to
    // distinguish between explicit zero and not specified. Defaults to 3.
    successfulJobsHistoryLimit?: pulumi.Input<number>,

    // The number of failed finished jobs to retain. This is a pointer to
    // distinguish between explicit zero and not specified. Defaults to 1.
    failedJobsHistoryLimit?: pulumi.Input<number>,

    // The JobBuilderArgs for the CronJob.
    jobBuilderArgs: JobBuilderArgs,
};

// DeploymentdBuilderArgs implements the spec settings for a Kubernetes
// Deployment.
export type DeploymentBuilderArgs = {
    // The number of desired replicas of the Pods.
    replicas?: pulumi.Input<number>;
};

// ReplicaSetdBuilderArgs implements the spec settings for a Kubernetes
// ReplicaSet.
export type ReplicaSetBuilderArgs = {
    // The number of desired replicas of the Pods.
    replicas?: pulumi.Input<number>;
};

// DaemonSetBuilderArgs implements the spec settings for a Kubernetes
// DaemonSet.
export type DaemonSetBuilderArgs = {
    // An update strategy to replace existing DaemonSet pods with new pods.  // Defaults to "RollingUpdate".
    updateStrategy?: pulumi.Input<string>;

    // The minimum number of seconds for which a newly created DaemonSet pod
    // should be ready without any of its container crashing, for it to be
    // considered available. Defaults to 0 (pod will be considered available as
    // soon as it is ready).
    minReadySeconds?: pulumi.Input<number>;

    // The number of old history to retain to allow rollback. This is a pointer to
    // distinguish between explicit zero and not specified. Defaults to 10.
    revisionHistoryLimit?: pulumi.Input<number>;
};

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

// Create a base manifest for a Kubernetes Deployment.
export function makeDeploymentBuilderBase(
    podBuilder: input.core.v1.Pod,
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
