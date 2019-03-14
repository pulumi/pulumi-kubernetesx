import * as pulumi from "@pulumi/pulumi";

const pulumiConfig = new pulumi.Config(pulumi.getProject());

// Existing nebula EKS cluster Pulumi stack.
const eksClusterStack = new pulumi.StackReference(pulumiConfig.require("eksClusterStackRef"));

export const config = {
    // Cluster details from nebula cluster output
    kubeconfig: eksClusterStack.getOutput("kubeconfig"),

    // Demo details
    name: "k8s-demo",
    namespace: "k8s-demo",
    hostname: "meetup.apps.pulumi.tech",
    image: "quay.io/metral/k8s-demo:0.0.1",
    nginxIngressClass: "my-nginx-class"
};
