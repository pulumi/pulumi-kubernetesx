import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as externalDnsRbac from "./external-dns-rbac";
import * as externalDns from "./external-dns";
import { config } from "./config";

export type ExternalDnsOptions = {
    provider?: k8s.Provider;
    namespace?: pulumi.Input<string>;
    iamRoleArn?: pulumi.Input<string>;
    primaryContainerArgs?: pulumi.Input<any>;
};

export class ExternalDns extends pulumi.ComponentResource {
    public readonly serviceAccount: k8s.core.v1.ServiceAccount;
    public readonly serviceAccountName: pulumi.Output<string>;
    public readonly clusterRole: k8s.rbac.v1.ClusterRole;
    public readonly clusterRoleName: pulumi.Output<string>;
    public readonly clusterRoleBinding: k8s.rbac.v1.ClusterRoleBinding;
    public readonly deployment: k8s.apps.v1.Deployment;

    constructor(
        name: string,
        args: ExternalDnsOptions = {},
        opts?: pulumi.ComponentResourceOptions,
    ){
        super(config.pulumiComponentNamespace, name, args, opts);

        if (args.provider == undefined ||
            args.namespace == undefined ||
            args.iamRoleArn == undefined ||
            args.primaryContainerArgs == undefined
        ){
            return {} as ExternalDns;
        }

        // ServiceAccount
        this.serviceAccount = externalDnsRbac.makeExternalDnsServiceAccount(args.provider, args.namespace)
        this.serviceAccountName = this.serviceAccount.metadata.apply(m => m.name);

        // RBAC ClusterRole
        this.clusterRole = externalDnsRbac.makeExternalDnsClusterRole(args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = externalDnsRbac.makeExternalDnsClusterRoleBinding(args.provider, args.namespace, this.serviceAccountName, this.clusterRoleName);

        // Deployment
        this.deployment = externalDns.makeExternalDnsDeployment(args.provider, args.namespace, this.serviceAccountName, args.iamRoleArn, args.primaryContainerArgs);
    }
}
