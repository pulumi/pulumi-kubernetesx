import * as pulumi from "@pulumi/pulumi";

// Existing nebula EKS cluster Pulumi stack.
const nebulaStack = new pulumi.StackReference(`metral/nebula/dev`)

export const config = {
    // Cluster details from nebula cluster output.
    instanceRoleArn: nebulaStack.getOutput("instanceRoleArn"),
    kubeconfig: nebulaStack.getOutput("kubeconfig"),

    // Namespace
	namespace: "cluster-services",
};
