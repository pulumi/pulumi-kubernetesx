import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

// Create a ServiceAccount for NGINX
export function makeNginxServiceAccount(
    namespace: pulumi.Input<string>): k8s.core.v1.ServiceAccount {
    return new k8s.core.v1.ServiceAccount(config.appName, {
        metadata: {
            namespace: namespace,
        },
    });
}

// Create a ClusterRole for NGINX
export function makeNginxClusterRole(): k8s.rbac.v1.ClusterRole {
    return new k8s.rbac.v1.ClusterRole(config.appName, {
        rules: [
            {
                apiGroups:[""],
                resources: ["configmaps", "endpoints", "nodes", "pods", "secrets"],
                verbs: ["list", "watch"],
            },
            {
                apiGroups:[""],
                resources: ["nodes"],
                verbs: ["get"],
            },
            {
                apiGroups:[""],
                resources: ["services"],
                verbs: ["get", "list", "watch"],
            },
            {
                apiGroups:["extensions"],
                resources: ["ingresses"],
                verbs: ["get", "list", "watch"],
            },
            {
                apiGroups:[""],
                resources: ["events"],
                verbs: ["create", "patch"],
            },
            {
                apiGroups:["extensions"],
                resources: ["ingresses/status"],
                verbs: ["update"],
            },
        ],
    });
}

// Create a ClusterRoleBinding for NGINX
export function makeNginxClusterRoleBinding(
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    clusterRoleName: pulumi.Input<string>): k8s.rbac.v1.ClusterRoleBinding {
    return new k8s.rbac.v1.ClusterRoleBinding(config.appName, {
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
    });
}

// Create a Role for NGINX
export function makeNginxRole(
    namespace: pulumi.Input<string>,
    ingressClass: pulumi.Input<string>): k8s.rbac.v1.Role{
    return new k8s.rbac.v1.Role(config.appName, {
        metadata: {
            namespace: namespace,
        },
        rules: [
            {
                apiGroups:[""],
                resources: ["configmaps", "pods", "secrets", "namespaces"],
                verbs: ["get"],
            },
            {
                apiGroups:[""],
                resources: ["configmaps"],
                // Defaults to "<election-id>-<ingress-class>"
                // In this setup its specifically: "<ingress-controller-leader>-<my-nginx-class>".
                // This has to be adapted if you change either parameter
                // (--election-id, and/or --ingress-class) when launching
                // the nginx-ing-cntlr.
                // See for more info: https://github.com/kubernetes/ingress/tree/master/docs/deploy/rbac.md#namespace-permissions
                resourceNames: ["ingress-controller-leader-" + ingressClass],
                verbs: ["get", "update"],
            },
            {
                apiGroups:[""],
                resources: ["configmaps"],
                verbs: ["create"],
            },
            {
                apiGroups:[""],
                resources: ["endpoints"],
                verbs: ["get", "create", "update"],
            },
        ],
    });
}

// Create a RoleBinding for NGINX
export function makeNginxRoleBinding(
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    roleName: pulumi.Input<string>): k8s.rbac.v1.RoleBinding {
    return new k8s.rbac.v1.RoleBinding(config.appName, {
        metadata: {
            namespace: namespace,
        },
        subjects: [
            {
                kind: "ServiceAccount",
                name: serviceAccountName,
                namespace: namespace,
            },
        ],
        roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Role",
            name: roleName,
        },
    });
}
