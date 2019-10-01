import * as pulumi from "@pulumi/pulumi";

let pulumiConfig = new pulumi.Config();

// Existing EKS cluster Pulumi stack.
// Stack reference to eksClusterStack in format:
// <organization>/<project>/<stack> e.g. "myuser/eks-cluster/dev"
const eksClusterStack = new pulumi.StackReference(pulumiConfig.require("eksClusterStackRef"));

export const config = {
    // Cluster details from eksClusterStack output.
    instanceRoleArn: eksClusterStack.getOutput("instanceRoleArn"),
    kubeconfig: eksClusterStack.getOutput("kubeconfig"),

    // Datadog API key.
    // datadogApiKey: pulumiConfig.require("datadogApiKey"),

    // Namespace to create and run in.
	namespace: "cluster-services",
};
