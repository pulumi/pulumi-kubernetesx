PROJECT_NAME := Pulumi Kubernetes Extensions
NODE_MODULE_NAME := @pulumi/kubernetesx
include ../../build/common.mk

VERSION := $(shell ../../scripts/get-version)

export PATH := $(shell yarn bin 2>/dev/null):$(PATH)

TESTPARALLELISM := 10

build::
	yarn install && yarn run install-peers -f
	tsc
	sed -e 's/\$${VERSION}/$(VERSION)/g' < package.json > bin/package.json
	cp ../../README.md ../../LICENSE bin/

lint::
	yarn install && yarn run install-peers -f && tslint -c ../tslint.json -p tsconfig.json
