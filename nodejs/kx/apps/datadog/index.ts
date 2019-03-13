import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as rbac from "./rbac";
import { config } from "./config";
// TODO: import from a persisent package location
import * as kx from "../../../kx";

export type DatadogOptions = {
    apiKey?: pulumi.Input<string>;
    namespace?: pulumi.Input<string>;
    provider?: k8s.Provider;
};

const pulumiComponetDatadog: string = "pulumi:kx:Datadog";

export class Datadog extends pulumi.ComponentResource {
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly serviceAccountName: pulumi.Output<string>;
    public readonly clusterRole: k8s.rbac.v1.ClusterRole;
    public readonly clusterRoleName: pulumi.Output<string>;
    public readonly clusterRoleBinding: k8s.rbac.v1.ClusterRoleBinding;
    public readonly daemonSet: k8s.extensions.v1beta1.DaemonSet;
    public readonly daemonSetName: pulumi.Output<string>;

    constructor(
        name: string,
        args: DatadogOptions = {},
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(pulumiComponetDatadog, name, args, opts);

        if (args.apiKey === undefined ||
            args.namespace === undefined ||
            args.provider === undefined) {
            return {} as Datadog;
        }

        const appName = kx.utils.trimString(`${name}`.toLowerCase(), 40);

        // Assemble the labels.
        const labels = {"app": appName};

        // Assemble the resources.
        const resources = {
            limits: {memory: "512Mi"},
            requests: {memory: "512Mi"},
        };

        // Create a ConfigMap to hold the env variables.
        const datadogConfigMap = new k8s.core.v1.ConfigMap(
            "datadog",
            {
                metadata: {
                    labels: labels,
                    namespace: args.namespace,
                },
                data: {
                    "DD_API_KEY": args.apiKey,
                    "DD_AC_EXCLUDE": "image:datadog/agent",
                    "DD_PROCESS_AGENT_ENABLED": "true",
                    "DD_LOGS_ENABLED": "true",
                    "DD_LOGS_CONFIG_CONTAINER_COLLECT_ALL": "true",
                    "DD_COLLECT_KUBERNETES_EVENTS": "true",
                    "DD_LEADER_ELECTION": "true",
                    "KUBERNETES": "true",
                },
            },
            {
                provider: args.provider,
            },
        );
        const datadogConfigMapName = datadogConfigMap.metadata.apply(m => m.name);

        // ServiceAccount
        this.serviceAccount = rbac.makeDatadogServiceAccount(appName, args.namespace, args.provider);
        this.serviceAccountName = this.serviceAccount.metadata.apply(m => m.name);

        // RBAC ClusterRole & Role
        this.clusterRole = rbac.makeDatadogClusterRole(appName, args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = rbac.makeDatadogClusterRoleBinding(
            appName, args.namespace, this.serviceAccountName, this.clusterRoleName, args.provider);

        const ddKubeletHostEnvVarSrc = {
            name: "DD_KUBERNETES_KUBELET_HOST",
            valueFrom: {
                fieldRef: {
                    fieldPath: "status.hostIP",
                },
            },
        };

        // Define the Pod args.
        const podBuilder = new kx.PodBuilder(appName, args.provider, {
            podSpec: {
                serviceAccountName: this.serviceAccountName,
                containers: [{
                    name: appName,
                    // Any image is permissable as long as:
                    // 1. It serves a 404 page at /
                    // 2. It serves 200 on a /healthz endpoint
                    image: config.appImage,
                    resources: resources,
                    livenessProbe: {
                        exec: {
                            command: [
                                "./probe.sh",
                            ],
                        },
                        initialDelaySeconds: 15,
                        periodSeconds: 5,
                    },
                }],
            },
        })
            .withMetadata({
                labels: labels,
                namespace: args.namespace,
            })
            .addEnvVarsFromConfigMap(datadogConfigMapName)
            .addEnvVar(ddKubeletHostEnvVarSrc)
            .mountVolume(
                "/var/run/docker.sock",
                {
                    name: "dockersocket",
                    hostPath: {path: "/var/run/docker.sock"},
                })
            .mountVolume(
                "/host/proc",
                {
                    name: "proc",
                    hostPath: {path: "/proc"},
                })
            .mountVolume(
                "/host/sys/fs/cgroup",
                {
                    name: "cgroup",
                    hostPath: {path: "/sys/fs/cgroup"},
                });

        // Create the DaemonSet.
        this.daemonSet = podBuilder.createDaemonSet(appName);
        this.daemonSetName = this.daemonSet.metadata.apply(m => m.name);
    }
}
