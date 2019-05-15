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
const vpc = awsx.Network.fromVpc(name,
    {
        vpcId: "vpc-0e5d4bcb19c954896",
        subnetIds: ["subnet-0feb18c742e1b09c5", "subnet-08523f1c5c680b685", "subnet-04f3ea79b70afdda5"],
        usePrivateSubnets: true,
        securityGroupIds: ["sg-0dbcb0c8327f6ccb6"],
        publicSubnetIds: ["subnet-098bf3f676265f011", "subnet-044e7c88896a9dfdb", "subnet-0ea95149f2e4cb356"],
    }
);

// Create a new EKS cluster.
//
// The `cluster.subnetIds` are used by EKS to place the running worker
// instances in the specificed subnets. These subnets can be public or private.
//
// Here we chose to deploy the EKS workers into the private subnets of our
// existing VPC from above.
const cluster = new eks.Cluster(name, {
    vpcId: vpc.vpcId,
    subnetIds: vpc.subnetIds,
    instanceType: "t2.medium",
    desiredCapacity: 2,
    minSize: 1,
    maxSize: 3,
    storageClasses: "gp2",
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
