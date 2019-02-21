import * as pulumi from "@pulumi/pulumi";

// Existing nebula EKS cluster Pulumi stack.
const nebulaStack = new pulumi.StackReference(`metral/nebula/dev`)

export const config = {
    // Cluster details from nebula cluster output
    kubeconfig: nebulaStack.getOutput("kubeconfig"),

    // Demo details
    name: "k8s-demo",
    namespace: "k8s-demo",
    hostname: "meetup.apps.pulumi.tech",
    image: "quay.io/metral/k8s-demo:0.0.1",
    nginxIngressClass: "my-nginx-class"
};
