import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

// Create a ServiceAccount.
export function makeDatadogServiceAccount(
    name: string,
    namespace: pulumi.Input<string>,
    provider: k8s.Provider): k8s.core.v1.ServiceAccount {
        return new k8s.core.v1.ServiceAccount(
            name,
            {metadata: {namespace: namespace}},
            {provider: provider},
        );
    }

// Create a ClusterRole.
export function makeDatadogClusterRole(
    name: string,
    provider: k8s.Provider): k8s.rbac.v1.ClusterRole {
        return new k8s.rbac.v1.ClusterRole(
            name,
            {
                rules: [
                    {   // To get info, statuses, and events.
                        apiGroups: [""],
                        resources: ["services", "events", "endpoints", "pods", "nodes", "componentstatuses"],
                        verbs: ["get", "list", "watch"],
                    },
                    {   // To create the leader election token
                        apiGroups: [""],
                        resources: ["configmaps"],
                        // datadogtoken: Kubernetes event collection state
                        // datadog-leader-election: Leader election token
                        resourceNames: ["datadogtoken", "datadog-leader-election"],
                        verbs: ["get", "update"],
                    },
                    {   // To create the leader election token
                        apiGroups: [""],
                        resources: ["configmaps"],
                        verbs: ["create"],
                    },
                    {   // Kubelet connectivity
                        apiGroups: [""],
                        resources: ["nodes/metrics", "nodes/spec", "nodes/proxy"],
                        verbs: ["get"],
                    },
                    {   // To get info and statuses.
                        nonResourceURLs: [ "/version", "/healthz"],
                        verbs: ["get"],
                    },
                ],
            },
            {
                provider: provider,
            },
        );
    }

// Create a ClusterRoleBinding of the ServiceAccount -> ClusterRole.
export function makeDatadogClusterRoleBinding(
    name: string,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    clusterRoleName: pulumi.Input<string>,
    provider: k8s.Provider): k8s.rbac.v1.ClusterRoleBinding {
    return new k8s.rbac.v1.ClusterRoleBinding(
        name,
        {
            subjects: [
                {
                    kind: "ServiceAccount",
                    name: serviceAccountName,
                    namespace: namespace,
                },
            ],
            roleRef: {
                apiGroup: "rbac.authorization.k8s.io",
                kind: "ClusterRole",
                name: clusterRoleName,
            },
        },
        {
            provider: provider,
        },
    );
}
