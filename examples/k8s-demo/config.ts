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
    hostname: "demo.myapps.pulumi.tech",
    image: "quay.io/metral/k8s-demo-private:0.0.1",
    nginxIngressClass: "my-nginx-class",

    // Docker registry creds in b64 encoding
    dockerConfigJson: pulumiConfig.require("dockerConfigJson"),
};
