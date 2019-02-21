import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";

// Create a fluentd-cloudwatch helm chart
export function makeFluentdCloudWatch(
    provider: k8s.Provider,
    namespace: pulumi.Input<string>,
    iamRoleArn: pulumi.Input<string>): k8s.helm.v2.Chart
    {
        // Create a new CloudWatch Log Group
        const fluentdCloudWatchName: string = "fluentd-cloudwatch";
        const fluentdCloudWatchLogGroup = new aws.cloudwatch.LogGroup(fluentdCloudWatchName, {});
        const fluentdCloudWatchLogGroupName = fluentdCloudWatchLogGroup.name;

        return new k8s.helm.v2.Chart(
            fluentdCloudWatchName,
            {
                namespace: namespace,
                chart: "fluentd-cloudwatch",
                version: "0.7.0",
                fetchOpts: {
                    repo: "https://kubernetes-charts-incubator.storage.googleapis.com/",
                },
                values: {
                    extraVars: [ "{ name: FLUENT_UID, value: '0' }" ],
                    podAnnotations: {
                        "iam.amazonaws.com/role": iamRoleArn
                    },
                    rbac: {
                        create: true,
                    },
                    awsRegion: aws.config.region,
                    logGroupName: fluentdCloudWatchLogGroupName,
                },
                transformations: [
                    (obj: any) => {
                        // Do transformations on the YAML to set the namespace
                        if (obj.metadata) {
                            obj.metadata.namespace = namespace
                        }
                    }
                ],
            },
            {
                providers: { kubernetes: provider }
            }
        );
    }
