import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as kx from "../../nodejs/kx";
import { config } from "./config";

// Create Kubernetes Pulumi provider
const provider = new k8s.Provider("kx-k8s-demo", {
    kubeconfig: config.kubeconfig.apply(JSON.stringify),
});

// Create app labels
const labels = { app: config.name };

// Create a Namespace
const namespace = new k8s.core.v1.Namespace(
    config.namespace,
    undefined,
    {
        provider: provider,
    }
);

let namespaceName = namespace.metadata.apply(m => m.name);

// Create a k8s-demo Service
const svc = new k8s.core.v1.Service(config.name,
    {
        metadata: {
            labels: labels,
            namespace: namespaceName,
        },
        spec: {
            ports: [{ port: 80, targetPort: "http" }],
            selector: labels,
        },
    },
    {
        provider: provider,
    }
);

// Export the Service name
export let serviceName = svc.metadata.apply(m => m.name);


// Assemble the Job resources.
const resources = {
    limits: {cpu: "256m", memory: "256Mi"},
    requests: { cpu: "256m", memory: "256Mi"},
};

// Create a k8s-demo Deployment
// Define the Pod args.
const podBuilder = new kx.PodBuilder(config.name, provider, {
    podSpec: {
        containers: [{
            name: config.name,
            image: config.image,
            ports: [{ name: "http", containerPort: 8080 }],
            resources: resources,
        }],
    },
})
    .withMetadata({
        labels: labels,
        namespace: namespaceName,
    })
    /*
    .addEnvVarsFromConfigMap(configMapName)
    .addImagePullSecrets(dockerConfigJson)
    .mountVolume(
        "/host/proc",
        {
            name: "proc",
            hostPath: {path: "/proc"},
        })
    */

// Create the Deployment.
const deployment = podBuilder.createDeployment(config.name, { replicas: 1 });

// Export the Deployment name
export let deploymentName = deployment.metadata.apply(m => m.name);

// Create a k8s-demo Ingress
const ing = new k8s.extensions.v1beta1.Ingress(config.name,
    {
        metadata: {
            labels: labels,
            namespace: namespaceName,
            annotations: {
                "kubernetes.io/ingress.class": config.nginxIngressClass,
            },
        },
        spec: {
            rules: [
                {
                    host: config.hostname,
                    http: {
                        paths: [
                            {
                                path: "/foobar",
                                backend: {
                                    serviceName: serviceName,
                                    servicePort: "http",
                                }
                            },
                        ],
                    },
                }
            ]
        }
    },
    {
        provider: provider,
    }
);

// Export the Ingress Name and Address
export let ingressName = ing.metadata.apply(m => m.name)
export let ingressHostname = ing.status.apply(status => status.loadBalancer.ingress[0].hostname)

// curl Command
// Export the curl command to hit the ingress endpoint for the k8s-demo
export let fullCurlCommand = pulumi.concat("curl -v -H 'Host: ", config.hostname, "' http://", ingressHostname, "/foobar")
export let curlCommand = pulumi.concat("curl -v ", config.hostname, "/foobar")
export let url = pulumi.concat(config.hostname, "/foobar")
