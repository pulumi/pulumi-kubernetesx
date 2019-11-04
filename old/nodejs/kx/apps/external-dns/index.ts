import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as rbac from "./rbac";
import { config } from "./config";
// TODO: import from a persisent package location
import * as kx from "../../../kx";

export type ExternalDnsOptions = {
    namespace?: pulumi.Input<string>;
    provider?: k8s.Provider;
    iamRoleArn?: pulumi.Input<string>;
    commandArgs?: pulumi.Input<any>;
};

const pulumiComponentNamespace: string = "pulumi:kx:NginxIngressController";

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
    ) {
        super(pulumiComponentNamespace, name, args, opts);

        if (args.provider === undefined ||
            args.namespace === undefined ||
            args.iamRoleArn === undefined ||
            args.commandArgs === undefined) {
            return {} as ExternalDns;
        }

        // ServiceAccount
        this.serviceAccount = rbac.makeExtDnsServiceAccount(name, args.provider, args.namespace);
        this.serviceAccountName = this.serviceAccount.metadata.apply(m => m.name);

        // RBAC ClusterRole
        this.clusterRole = rbac.makeExtDnsClusterRole(name, args.provider);
        this.clusterRoleName = this.clusterRole.metadata.apply(m => m.name);
        this.clusterRoleBinding = rbac.makeExtDnsClusterRoleBinding(
            name, args.provider, args.namespace, this.serviceAccountName, this.clusterRoleName);

        // Deployment
        const labels = { app: name };
        this.deployment = makeExtDnsDeployment(
            name, args.provider, args.namespace,
            this.serviceAccountName, args.iamRoleArn, labels, args.commandArgs);
    }
}

// Create a Deployment
export function makeExtDnsDeployment(
    name: string,
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    serviceAccountName: pulumi.Input<string>,
    iamRoleArn: pulumi.Input<string>,
    labels: pulumi.Input<any>,
    commandArgs: pulumi.Input<any>): k8s.apps.v1.Deployment {
    // Define the Pod args.
    const podBuilder = new kx.PodBuilder(name, provider, {
        podSpec: {
            serviceAccountName: serviceAccountName,
            containers: [
                {
                    name: name,
                    image: config.appImage,
                    args: commandArgs,
                },
            ],
        },
    })
        .withMetadata({
            labels: labels,
            annotations: {
                "iam.amazonaws.com/role": iamRoleArn,
            },
            namespace: namespace,
        });

    // Create the Deployment.
    return podBuilder.createDeployment(name, { replicas: 1 });
}
