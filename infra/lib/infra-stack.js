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

    const getPlacesFn = new node.NodejsFunction(this, 'GetPlacesFn', {
      entry: '../backend/functions/getPlaces.js',
      runtime: lambda.Runtime.NODEJS_18_X,
      bundling: { minify: true },
    });

    const api = new apigw.HttpApi(this, 'OpenLateApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.OPTIONS],
      },
    });

    api.addRoutes({
      path: '/places',
      methods: [apigw.HttpMethod.GET],
      integration: new httpint.HttpLambdaIntegration('GetPlacesInt', getPlacesFn),
    });

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'CloudFrontURL', { value: `https://${distribution.domainName}` });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'SiteBucketName', { value: siteBucket.bucketName });
  }
}

module.exports = { InfraStack };
