import * as pulumi from "@pulumi/pulumi";

// Existing nebula EKS cluster Pulumi stack.
const nebulaStack = new pulumi.StackReference(`metral/nebula/dev`)

export const config = {
    // Cluster details from nebula cluster output.
    clusterName: nebulaStack.getOutput("clusterName"),
    kubeconfig: nebulaStack.getOutput("kubeconfig"),

    // Name and Namespace
    name: "app-services",
    namespace: "app-services",

    // NGINX Ingress Controller name, and ingress class to create, and use.
    nginxName: "nginx-ing-cntlr",
    nginxIngressClass: "my-nginx-class",

    // Base IAM Role ARN for kube2iam to allow Workers to assume other roles.
    kube2iamRoleArn: "arn:aws:iam::153052954103:role/k8sRoleKube2Iam",

    // DNS Hosted Zone to use with external-dns.
    externalDnsDomainFilter: "pulumi.tech",

    // IAM Role for external-dns DaemonSet to manage R53 record sets in a
    // Hosted Zone.
    externalDnsRoleArn: "arn:aws:iam::153052954103:role/k8sRoleExternalDns",

    // Demo k8s name, namespace, and image.
    demoName: "k8s-demo",
    demoNamespace: "k8s-demo",
    demoImage: "quay.io/metral/k8s-demo:0.0.1",
};
