# @flipboxlabs/aws-audit-cdk

AWS Audit CDK - CDK constructs for AWS audit infrastructure

## Installation

```bash
npm install @flipboxlabs/aws-audit-cdk
# or
pnpm add @flipboxlabs/aws-audit-cdk
```

## Usage

```typescript
import { CloudWatchConstruct } from '@flipboxlabs/aws-audit-cdk/cloudwatch';
import { DynamoDBConstruct } from '@flipboxlabs/aws-audit-cdk/dynamodb';
import { EventBridgeConstruct } from '@flipboxlabs/aws-audit-cdk/eventbridge';
import { RestApiConstruct } from '@flipboxlabs/aws-audit-cdk/rest-api';
```

## Constructs

- **CloudWatchConstruct** - CloudWatch log subscription for audit capture
- **DynamoDBConstruct** - DynamoDB table for audit storage
- **EventBridgeConstruct** - EventBridge bus for audit events
- **RestApiConstruct** - REST API for querying audits

## Peer Dependencies

- `aws-cdk-lib` >= 2.135.0
- `constructs` >= 10.3.0

## License

MIT
