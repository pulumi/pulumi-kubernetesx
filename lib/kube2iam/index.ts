import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kube2iamRbac from "./kube2iam-rbac";
import * as kube2iam from "./kube2iam";
import { config } from "./config";

export type Kube2IamOptions = {
    provider?: k8s.Provider;
    namespace?: pulumi.Input<string>;
    primaryContainerArgs?: pulumi.Input<any>;
    ports?: pulumi.Input<any>;
};

export class Kube2Iam extends pulumi.ComponentResource {
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly serviceAccountName: pulumi.Output<string>;
    public readonly clusterRole: k8s.rbac.v1.ClusterRole;
    public readonly clusterRoleName: pulumi.Output<string>;
    public readonly clusterRoleBinding: k8s.rbac.v1.ClusterRoleBinding;
    public readonly daemonSet: k8s.apps.v1.DaemonSet;

    constructor(
        name: string,
        args: Kube2IamOptions = {},
        opts?: pulumi.ComponentResourceOptions,
    ){
        super(config.pulumiComponentNamespace, name, args, opts);

        if (args.provider == undefined ||
            args.namespace == undefined ||
            args.primaryContainerArgs == undefined ||
            args.ports == undefined
        ){
            return {} as Kube2Iam;
        }

        // ServiceAccount
        this.serviceAccount = kube2iamRbac.makeKube2IamServiceAccount(args.provider, args.namespace)
        this.serviceAccountName = this.serviceAccount.metadata.apply(m => m.name);

        // RBAC ClusterRole
        this.clusterRole = kube2iamRbac.makeKube2IamClusterRole(args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = kube2iamRbac.makeKube2IamClusterRoleBinding(args.provider, args.namespace, this.serviceAccountName, this.clusterRoleName);

        // DaemonSet
        this.daemonSet = kube2iam.makeKube2IamDaemonSet(args.provider, args.namespace, this.serviceAccountName, args.primaryContainerArgs, args.ports);
    }
}
