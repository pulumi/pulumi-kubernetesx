import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Policies implements a map of policy name keys, to ARN values
export type Policies = { [name: string]: pulumi.Input<aws.ARN> };

// Creates a new IAM Role, and attaches the specified policies.
export function newRoleWithPolicies(
    name: string,
    args: aws.iam.RoleArgs,
    policies: Policies): aws.iam.Role
{
    const role = new aws.iam.Role(name, args);
    for (const policy of Object.keys(policies)) {
        // Create RolePolicyAttachment without returning it.
        new aws.iam.RolePolicyAttachment(
            name,
            {
                policyArn: policies[policy],
                role: role
            },
        );
    }
    return role;
}

// Helper function to create a new IAM Policy.
export function createPolicy(
    name: string,
    args: aws.iam.PolicyArgs): aws.iam.Policy
{
    let policyArgs: aws.iam.PolicyArgs = args;
    return new aws.iam.Policy(name, policyArgs);
}

// Add the specified policies to the existing IAM Principal
export function addPoliciesToExistingRole(
    name: string,
    role: aws.iam.Role,
    policies: Policies)
{
    for (const policy of Object.keys(policies)) {
        // Create RolePolicyAttachment without returning it.
        new aws.iam.RolePolicyAttachment(
            name,
            {
                policyArn: policies[policy],
                role: role
            },
        );
    }
}

// Creates an IAM PolicyDocument to allow the User ARN to assume roles.
export function assumeUserRolePolicy(user: aws.ARN): aws.iam.PolicyDocument {
    return {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: { AWS: [user] },
                Action: "sts:AssumeRole",
            },
        ],
    };
}

// Creates an IAM PolicyDocument to allow the Service ARN to assume roles.
export function assumeServiceRolePolicy(service: aws.ARN): aws.iam.PolicyDocument {
    return {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: { Service: [service] },
                Action: "sts:AssumeRole",
            },
        ],
    };
}
