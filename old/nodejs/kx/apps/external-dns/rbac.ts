import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

// Create a ServiceAccount.
export function makeExtDnsServiceAccount(
    name: string,
    provider: k8s.Provider,
    namespace: pulumi.Input<string>): k8s.core.v1.ServiceAccount {
    return new k8s.core.v1.ServiceAccount(
        name, {
            metadata: {
                namespace: namespace,
            },
        },
        {
            provider: provider,
        },
    );
}

// Create a ClusterRole.
export function makeExtDnsClusterRole(
    name: string,
    provider: k8s.Provider): k8s.rbac.v1.ClusterRole {
    return new k8s.rbac.v1.ClusterRole(
        name,
        {
            rules: [
                {
                    apiGroups: [""],
                    resources: ["services"],
                    verbs: ["get", "list", "watch"],
                },
                {
                    apiGroups: [""],
                    resources: ["pods"],
                    verbs: ["get", "list", "watch"],
                },
                {
                    apiGroups: ["extensions"],
                    resources: ["ingresses"],
                    verbs: ["get", "list", "watch"],
                },
                {
                    apiGroups: [""],
                    resources: ["nodes"],
                    verbs: ["list"],
                },
            ],
        },
        {
            provider: provider,
        },
    );
}

// Create a ClusterRoleBinding from ServiceAccount -> ClusterRole.
export function makeExtDnsClusterRoleBinding(
    name: string,
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    clusterRoleName: pulumi.Input<string>): k8s.rbac.v1.ClusterRoleBinding {
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
