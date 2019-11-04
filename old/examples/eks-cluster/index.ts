import * as pulumi from "@pulumi/pulumi";
import * as awsx from "@pulumi/awsx";
import * as eks from "@pulumi/eks";

const name = "kx-eks-cluster";

// Retrieve an existing VPC.
//
// Note: The `vpc` object is not required for the cluster configuration below
// as we're only referencing the `vpcId` and `subnetIds` props. However, retrieving
// a reference to the `vpc` can be useful to have, if needed.
//
// vpcId: the VPC ID.
// subnetIds: the private subnets of the VPC.
// usePrivateSubnets: true: run compute instances in private subnets | false: run instances in public subnets.
// securityGroupIds: the security group IDs of the VPC.
// publicSubnetIds: the public subnets of the VPC.
const vpc = new awsx.ec2.Vpc(name, {
    tags: { "Name": `${name}` },
});

// Create a new EKS cluster.
//
// The `cluster.subnetIds` are used by EKS to place the running worker
// instances in the specificed subnets. These subnets can be public or private.
//
// Here we chose to deploy the EKS workers into the private subnets of our
// existing VPC from above.
const cluster = new eks.Cluster(name, {
    vpcId: vpc.id,
    publicSubnetIds: vpc.publicSubnetIds,
    deployDashboard: false,
});

// Export the cluster name
export const clusterName = cluster.core.cluster.name;

// Export the cluster's Node / Worker IAM Role ARNs and prefix
export const clusterRoleArn = cluster.core.cluster.roleArn;
export const roles = cluster.core.instanceRoles!;
export const instanceRoleArn = roles.apply(r => r[0].arn);

// Export the cluster kubeconfig.
export const kubeconfig = cluster.kubeconfig
