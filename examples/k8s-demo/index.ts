import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import { config } from "./config";
import * as nginxIngCntlr from "../../lib/nginx-ingress-controller";
import * as externalDns from "../../lib/external-dns";
import * as kube2iam from "../../lib/kube2iam";
//------------------------------------------------------------------------------
// Namespace

// Create a k8s-demo Namespace
const ns = new k8s.core.v1.Namespace(config.namespace);

// Export the Namespace name
export let nsName = ns.metadata.apply(m => m.name);
//------------------------------------------------------------------------------
// NGINX

// Create the NGINX k8s resource stack
let nginxIngressController = new nginxIngCntlr.NginxIngressController(config.nginxName, {
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

// Export the NGINX nme
export let nginxIngressControllerName = nginxIngressController.deployment.metadata.apply(m => m.name);

//------------------------------------------------------------------------------
// kube2iam

// Create the kube2iam k8s resource stack
let k2i = new kube2iam.Kube2Iam(config.name, {
    namespace: nsName,
    primaryContainerArgs: pulumi.all([
        "--app-port=8181",
        "--base-role-arn=" + config.kube2iamRoleArn,
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
// External DNS

// Create the External DNS k8s resource stack
let extDns = new externalDns.ExternalDns(config.name, {
    namespace: nsName,
    iamRoleArn: config.externalDnsRoleArn,
    primaryContainerArgs: [
        "--source=ingress",
        "--domain-filter=" + config.externalDnsDomainFilter, // will make ExternalDNS see only the hosted zones matching provided domain, omit to process all available hosted zones
        "--provider=aws",
        "--policy=sync", // would prevent ExternalDNS from ny records, omit to enable full synchronization
        "--aws-zone-type=public", // only look at public hosted zones ues are public, private or no value for both)
        "--registry=txt",
        "--txt-owner-id=" + config.clusterName,
    ],
});

if (Object.keys(externalDns).length == 0) {
    throw new Error("The externalDns object is empty and cannot be created. Check for missing parameters.")
}

// Export the ExternalDns nme
export let extDnsName = extDns.deployment.metadata.apply(m => m.name);

//------------------------------------------------------------------------------
// k8s-demo

// Labels
const appLabels = { app: config.demoName };

// Create a Namespace
const appNamespace = new k8s.core.v1.Namespace(config.demoNamespace);
let appNamespaceName = appNamespace.metadata.apply(m => m.name);

// Create a k8s-demo Service
const svc = new k8s.core.v1.Service(config.demoName, {
    metadata: {
        labels: appLabels,
        namespace: appNamespaceName,
    },
    spec: {
        ports: [{ port: 80, targetPort: "http" }],
        selector: appLabels,
    },
});

// Export the Service name
export let appServiceName = svc.metadata.apply(m => m.name);

// Create a k8s-demo Deployment
const deploy = new k8s.apps.v1.Deployment(config.demoName, {
    metadata: {
        labels: appLabels,
        namespace: appNamespaceName,
    },
    spec: {
        replicas: 1,
        selector: { matchLabels: appLabels },
        template: {
            metadata: {
                labels: appLabels,
            },
            spec: {
                containers: [
                    {
                        name: config.demoName,
                        image: config.demoImage,
                        imagePullPolicy: "Always",
                        ports: [{ name: "http", containerPort: 8080 }]
                    }
                ],
            }
        }
    }
});

// Export the Deployment name
export let appDeploymentName = deploy.metadata.apply(m => m.name);

// Create a k8s-demo Ingress
const ing = new k8s.extensions.v1beta1.Ingress(config.demoName, {
    metadata: {
        labels: appLabels,
        namespace: appNamespaceName,
        annotations: {
            "kubernetes.io/ingress.class": config.nginxIngressClass,
        },
    },
    spec: {
        rules: [ 
            {
                host: "meetup.apps.pulumi.tech",
                http: {
                    paths: [
                        {
                            path: "/foobar",
                            backend: {
                                serviceName: appServiceName,
                                servicePort: "http",
                            }
                        },
                    ],
                },
            }
        ]
    }
});

// Export the Ingress Name and Address
export let appIngressName = ing.metadata.apply(m => m.name)
export let appIngressHostname = ing.status.apply(status => status.loadBalancer.ingress[0].hostname)

//------------------------------------------------------------------------------
// curl Command

// Export the curl command to hit the ingress endpoint for the k8s-demo
export let appCurlCommand = pulumi.concat("curl -v -H 'Host: apps.example.com' http://", appIngressHostname, "/foobar")
