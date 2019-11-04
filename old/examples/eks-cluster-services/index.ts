import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import * as iam from "./iam";
import * as kx from "../../nodejs/kx";
import { config } from "./config";

// Setup Pulumi Kubernetes provider.
const provider = new k8s.Provider("eks-k8s", {
    kubeconfig: config.kubeconfig.apply(JSON.stringify),
});

// Get the IAM role name of the Kubernetes Node / Worker instance profile.
const instanceRoleName = config.instanceRoleArn.apply(s => s.split("/")).apply(s => s[1]);

// -- Create Namespace --

// Create a cluster-services Namespace.
const ns = new k8s.core.v1.Namespace(
    config.namespace,
    undefined,
    {
        provider: provider,
    }
);

// Export the Namespace name.
export const nsName = ns.metadata.apply(m => m.name);

// -- Setup IAM for kube2iam --

// Create a new IAM Policy for kube2iam to allow k8s Nodes/Workers to assume an
// IAM role.
const kube2iamPolicy = iam.createPolicy(
    "kubeIamPolicyKube2Iam",
    {
        description:
        "Allows Kubernetes Workers to assume any rolespecified by a Pod's annotation.",
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

// Attach the kube2iam policy to the node/instance AWS Role for the
// Kubernetes Nodes / Workers.
const role = aws.iam.Role.get("existingInstanceRole", instanceRoleName)
iam.addPoliciesToExistingRole(
    "kube2IamPolicy",
    role,
    {
        "kube2IamPolicy": kube2iamPolicy.arn,
    },
);

// -- Deploy kube2iam --

// Create the kube2iam k8s resource stack.
export const kube2IamArnPrefix = pulumi.concat(config.instanceRoleArn.apply(s => s.split("/")).apply(s => s[0]), "/");

const k2i = new kx.aws.Kube2Iam("kube2iam", {
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
// export const kube2iamName = k2i.daemonSet.metadata.apply(m => m.name);

// -- Setup IAM for external-dns --

// Create a new IAM Policy for external-dns to manage R53 record sets.
const externalDnsPolicy = iam.createPolicy(
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
        assumeRolePolicy: config.instanceRoleArn.apply(iam.assumeUserRolePolicy),
    },
    {
        "externalDnsPolicy": externalDnsPolicy.arn,
    },
);

// Export the IAM Role ARN
export const externalDnsRoleArn = externalDnsRole.arn;

// -- Setup IAM for fluentd-cloudwatch --

// Create a new IAM Policy for fluentd-cloudwatch to manage CloudWatch Logs.
const fluentdCloudWatchPolicy = iam.createPolicy(
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

// Create a new IAM Role for fluentd-cloudwatch.
const fluentdCloudWatchRole = iam.newRoleWithPolicies(
    "kubeIamRoleFluentdCloudWatch",
    {
        description: 
        "Allows k8s fluentd-cloudwatch to store k8s cluster and Pod logs in CloudWatch Logs.",
        assumeRolePolicy: config.instanceRoleArn.apply(iam.assumeUserRolePolicy),
    },
    {
        "fluentdCloudWatchPolicy": fluentdCloudWatchPolicy.arn,
    },
);

// Export the IAM Role ARN
export const fluentdCloudWatchRoleArn = fluentdCloudWatchRole.arn;

// -- Deploy fluentd-cloudwatch --

// Create the fluentd-cloudwatch k8s resource stack
export const fluentdCloudWatch = new kx.aws.FluentdCloudWatch("fluentd-cloudwatch", {
    provider: provider,
    namespace: nsName,
    iamRoleArn: fluentdCloudWatchRoleArn,
});

if (Object.keys(fluentdCloudWatch).length == 0) {
    throw new Error("The fluentdCloudWatch object is empty and cannot be created. Check for missing parameters.")
}

/*
// -- Deploy Datadog --

// Create the Datadog k8s resource stack
let datadog = new kx.apps.Datadog("datadog", {
    apiKey: config.datadogApiKey,
    namespace: nsName,
    provider: provider,
});

if (Object.keys(datadog).length == 0) {
    throw new Error("The Datadog object is empty and cannot be created. Check for missing parameters.")
}

// Export the name
export let datadogName = datadog.daemonSetName;
*/
