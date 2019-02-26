import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as iam from "./iam";
import * as kube2iam from "../../lib/kube2iam";
import * as fluentd from "../../lib/fluentd-cloudwatch";
import { config } from "./config";

// Helper function to create a new IAM Policy
export function createPolicy(
    name: string,
    args: aws.iam.PolicyArgs): aws.iam.Policy
{
    let policyArgs: aws.iam.PolicyArgs = args;
    return new aws.iam.Policy(name, policyArgs);
}

//------------------------------------------------------------------------------
// Setup Pulumi Kubernetes provider and create namespace

const provider = new k8s.Provider("eks-k8s", {
    kubeconfig: config.kubeconfig.apply(JSON.stringify),
});

// Namespace

// Create a cluster-services Namespace
const ns = new k8s.core.v1.Namespace(
    config.namespace,
    undefined,
    {
        provider: provider,
    }
);

// Export the Namespace name
export let nsName = ns.metadata.apply(m => m.name);
//------------------------------------------------------------------------------
// Setup IAM for kube2iam

// Create a new IAM Policy for kube2iam
const kube2iamPolicy = this.createPolicy(
    "kubeIamPolicyKube2Iam",
    {
        description:
        "Allows Kubernetes Workers to assume any role specified by a Pod's annotation, managed by kube2iam.",
        policy: JSON.stringify(
            {
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Action: "sts:AssumeRole",
                        Resource: "*"
                    }
                ]
            }
        )
    },
);

// Attach the kube2iam policy to an existing AWS Role for the Node / Worker
// instances.
export const kube2IamArnPrefix = pulumi.concat(config.instanceRoleArn.apply(s => s.split("/")).apply(s => s[0]), "/");
const roleName = config.instanceRoleArn.apply(s => s.split("/")).apply(s => s[1]);
export const role = aws.iam.Role.get("existingInstanceRole", roleName)
iam.addPoliciesToExistingRole(
    "kube2IamPolicy",
    role,
    {
        "kube2IamPolicy": kube2iamPolicy,
    },
);

//------------------------------------------------------------------------------
// kube2iam

// Create the kube2iam k8s resource stack
let k2i = new kube2iam.Kube2Iam("kube2iam", {
    provider: provider,
    namespace: nsName,
    primaryContainerArgs: pulumi.all([
        "--app-port=8181",
        pulumi.concat("--base-role-arn=", kube2IamArnPrefix),
        "--iptables=true",
        "--host-ip=$(HOST_IP)",
        "--host-interface=eni+",
        "--verbose"
    ]),
    ports: [
        {
            containerPort: 8181,
            hostPort: 8181,
            protocol: "TCP",
            name: "http",
        },
    ],
});

if (Object.keys(k2i).length == 0) {
    throw new Error("The kube2iam object is empty and cannot be created. Check for missing parameters.")
}

// Export the kube2iam nme
export let kube2iamName = k2i.daemonSet.metadata.apply(m => m.name);
//------------------------------------------------------------------------------
// Setup IAM for external-dns

// Create a new IAM Policy for external-dns
const externalDnsPolicy = this.createPolicy(
    "kubeIamPolicyExternalDns",
    {
        description:
        "Allows k8s external-dns to manage R53 Hosted Zone records.",
        policy: JSON.stringify(
            {
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Action: [
                            "route53:ChangeResourceRecordSets"
                        ],
                        Resource: [
                            "arn:aws:route53:::hostedzone/*"
                        ]
                    },
                    {
                        Effect: "Allow",
                        Action: [
                            "route53:ListHostedZones",
                            "route53:ListResourceRecordSets"
                        ],
                        Resource: [
                            "*"
                        ]
                    }
                ]
            }
        )
    },
);

// Create a new IAM Role for external-dns
const externalDnsRole = iam.newRoleWithPolicies(
    "kubeIamRoleExternalDns",
    {
        description: 
        "Allows k8s external-dns to manage R53 Hosted Zone records.",
        assumeRolePolicy: config.instanceRoleArn.apply(iam.assumeRolePolicy),
    },
    {
        "externalDnsPolicy": externalDnsPolicy,
    },
);

// Export the IAM Role ARN
export const externalDnsRoleArn = externalDnsRole.arn;
//------------------------------------------------------------------------------
// Setup IAM for fluentd-cloudwatch

// Create a new IAM Policy for fluentd-cloudwatch
const fluentdCloudWatchPolicy = this.createPolicy(
    "kubeIamPolicyFluentdCloudWatch",
    {
        description:
        "Allows k8s fluentd-cloudwatch to store k8s cluster and Pod logs in CloudWatch Logs.",
        policy: JSON.stringify(
            {
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Action: [
                            "logs:CreateLogGroup",
                            "logs:CreateLogStream",
                            "logs:DescribeLogGroups",
                            "logs:DescribeLogStreams",
                            "logs:PutLogEvents"
                        ],
                        Resource: [
                            "arn:aws:logs:*:*:*"
                        ]
                    }
                ]
            }
        )
    },
);

// Create a new IAM Role for fluentd-cloudwatch
const fluentdCloudWatchRole = iam.newRoleWithPolicies(
    "kubeIamRoleFluentdCloudWatch",
    {
        description: 
        "Allows k8s fluentd-cloudwatch to store k8s cluster and Pod logs in CloudWatch Logs.",
        assumeRolePolicy: config.instanceRoleArn.apply(iam.assumeRolePolicy),
    },
    {
        fluentdCloudWatchPolicy: fluentdCloudWatchPolicy,
    },
);

// Export the IAM Role ARN
export const fluentdCloudWatchRoleArn = fluentdCloudWatchRole.arn;

//------------------------------------------------------------------------------
// fluentd-cloudwatch

// Create the fluentd-cloudwatch k8s resource stack
export const fluentdCloudWatch = new fluentd.FluentdCloudWatch("fluentd-cloudwatch", {
    provider: provider,
    namespace: nsName,
    iamRoleArn: fluentdCloudWatchRoleArn,
});

if (Object.keys(fluentdCloudWatch).length == 0) {
    throw new Error("The externalDns object is empty and cannot be created. Check for missing parameters.")
}
