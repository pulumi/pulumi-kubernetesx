import * as pulumi from "@pulumi/pulumi";

// Existing nebula EKS cluster Pulumi stack.
const nebulaStack = new pulumi.StackReference(`metral/nebula/dev`)
const nebulaClusterServicesStack = new pulumi.StackReference(`metral/nebula-cluster-services/dev`)

export const config = {
    // Cluster details from nebula cluster output.
    clusterName: nebulaStack.getOutput("clusterName"),
    kubeconfig: nebulaStack.getOutput("kubeconfig"),

    // Namespace
    namespace: "app-services",

    // NGINX Ingress Controller name, and ingress class to create, and use.
    nginxIngressClass: "my-nginx-class",

    // DNS Hosted Zone to use with external-dns.
    externalDnsDomainFilter: "pulumi.tech",

    // IAM Role for external-dns DaemonSet to manage R53 record sets in a
    // Hosted Zone.
    externalDnsRoleArn: nebulaClusterServicesStack.getOutput("externalDnsRoleArn"),
};
