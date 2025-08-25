# Food Closing Clock

A web app that shows nearby food places closing soon with a live countdown and clickable map.
Built with React + Leaflet (frontend on S3/CloudFront) and a lightweight API Gateway, Lambda, DynamoDB backend that caches OpenStreetMap results.

## Run Locally

`cd frontend`
`npm install`
`echo "VITE_API_URL=https://zne4xx0jb5.execute-api.us-west-2.amazonaws.com" > .env.local`
`npm run dev`

## Live Demo

[https://d2x5j28paqadgk.cloudfront.net/](https://d2x5j28paqadgk.cloudfront.net/)  
