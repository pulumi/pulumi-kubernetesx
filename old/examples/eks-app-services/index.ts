import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "../../nodejs/kx";
import { config } from "./config";

// Create Kubernetes Pulumi provider
const provider = new k8s.Provider("eks-k8s", {
    kubeconfig: config.kubeconfig.apply(JSON.stringify),
});

// Create a Namespace
const ns = new k8s.core.v1.Namespace(
    config.namespace,
    undefined,
    {
        provider: provider,
    }
);

// Export the Namespace name
export let nsName = ns.metadata.apply(m => m.name);

// -- NGINX Ingress Controller --

// Create the NGINX k8s resource stack
let nginxIngressController = new kx.apps.NginxIngressController("nginx-ing-cntlr", {
    provider: provider,
    nginxReplicas: config.nginxReplicas,
    namespace: nsName,
    ingressClass: config.nginxIngressClass,
    svcPortType: "LoadBalancer",
    svcPorts: [
        {
            port: 80,
            protocol: "TCP",
            targetPort: "http",
        },
    ]
});

if (Object.keys(nginxIngressController).length == 0) {
    throw new Error("The nginxIngressController object is empty and cannot be created. Check for missing parameters.")
}

// Export the NGINX name
export let nginxIngressControllerName = nginxIngressController.deployment.metadata.apply(m => m.name);

// -- external-dns --

// Create the External DNS k8s resource stack
let extDns = new kx.apps.ExternalDns("external-dns", {
    provider: provider,
    namespace: nsName,
    iamRoleArn: config.externalDnsRoleArn,
    commandArgs: [
        "--source=ingress",
        "--domain-filter=" + config.externalDnsDomainFilter, // will make ExternalDNS see only the hosted zones matching provided domain, omit to process all available hosted zones
        "--provider=aws",
        "--policy=sync", // would prevent ExternalDNS from ny records, omit to enable full synchronization
        "--aws-zone-type=public", // only look at public hosted zones ues are public, private or no value for both)
        "--registry=txt",
        config.clusterName.apply(name => `--txt-owner-id=${name}`)
    ],
});

if (Object.keys(extDns).length == 0) {
    throw new Error("The externalDns object is empty and cannot be created. Check for missing parameters.")
}

// Export the ExternalDns nme
export let extDnsName = extDns.deployment.metadata.apply(m => m.name);
