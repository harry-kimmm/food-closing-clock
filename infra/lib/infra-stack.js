const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const lambda = require('aws-cdk-lib/aws-lambda');
const node = require('aws-cdk-lib/aws-lambda-nodejs');
const apigw = require('@aws-cdk/aws-apigatewayv2-alpha');
const httpint = require('@aws-cdk/aws-apigatewayv2-integrations-alpha');
const { Stack, RemovalPolicy, CfnOutput } = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');

class InfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const oai = new cloudfront.OriginAccessIdentity(this, 'SiteOAI');
    siteBucket.grantRead(oai);

    const distribution = new cloudfront.Distribution(this, 'SiteDist', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket, { originAccessIdentity: oai }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: undefined },
      ],
    });

    const placeCache = new dynamodb.Table(this, 'PlaceCache', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const closingFn = new node.NodejsFunction(this, 'ClosingFn', {
      entry: '../backend/functions/closing.js',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: { minify: true },
      environment: {
        TABLE_NAME: placeCache.tableName,
        CACHE_TTL_SECONDS: '86400',
        USER_AGENT: 'LateNightFinder/1.0 (demo)',
      },
    });

    placeCache.grantReadWriteData(closingFn);

    const api = new apigw.HttpApi(this, 'ClosingApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type'],
      },
    });

    api.addRoutes({
      path: '/closing',
      methods: [apigw.HttpMethod.GET],
      integration: new httpint.HttpLambdaIntegration('ClosingInt', closingFn),
    });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'CloudFrontURL', { value: `https://${distribution.domainName}` });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName });
  }
}

module.exports = { InfraStack };
