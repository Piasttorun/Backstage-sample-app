# java-sample-service

A minimal Spring Boot REST service used as a pilot for the DevOps Portal.

## Overview

This service exposes a single HTTP endpoint and is used to validate the Backstage
catalog integration, TechDocs pipeline, and CI metrics webhook.

## Running locally

```bash
./mvnw spring-boot:run
```

The service starts on port `8080` by default.

## Configuration

No external configuration required for local development.
