import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config(pulumi.getProject());

// Existing eks-cluster and eks-cluster-services Pulumi stacks.
// Stack reference names must be in the format: <organization>/<project>/<stack>
// e.g. "myuser/eks-cluster/dev" and "myuser/eks-cluster-services/dev"
const eksClusterStack = new pulumi.StackReference(pulumiConfig.require("eksClusterStackRef"));
const eksClusterServicesStack = new pulumi.StackReference(pulumiConfig.require("eksClusterServicesStackRef"));

export const config = {
    // Cluster details from eksClusterStack output.
    clusterName: eksClusterStack.getOutput("clusterName"),
    kubeconfig: eksClusterStack.getOutput("kubeconfig"),

    // Namespace to create and run in.
    namespace: "app-services",

    // NGINX Ingress Controller details:
    // - Ingress class, used to determine which ingress objects to manage.
    nginxIngressClass: "my-nginx-class",
    // - Number of replicas of the primary NGINX Deployment
    nginxReplicas: 2,

    // DNS Hosted Zone to use with external-dns.
    externalDnsDomainFilter: pulumiConfig.require("awsHostedZoneDomainName"),

    // IAM Role for external-dns DaemonSet to manage AWS R53 hosted zone
    // record sets.
    externalDnsRoleArn: eksClusterServicesStack.getOutput("externalDnsRoleArn"),
};
