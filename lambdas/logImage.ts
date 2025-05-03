import { S3Event, SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const tableName = process.env.TABLE_NAME || "";
const bucketName = process.env.BUCKET_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Processing image upload event");
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      console.log("SQS Message Body:", JSON.stringify(body, null, 2));
      
      const s3Event = JSON.parse(body.Message) as S3Event;
      
      for (const s3Record of s3Event.Records) {
        const bucket = s3Record.s3.bucket.name;
        const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
        
        console.log(`Processing file: ${key} from bucket: ${bucket}`);
        
        // Validate if image is jpeg or png
        if (!key.toLowerCase().endsWith('.jpeg') && 
            !key.toLowerCase().endsWith('.jpg') && 
            !key.toLowerCase().endsWith('.png')) {
          console.error(`Invalid file type for ${key}. Only .jpeg, .jpg, and .png are allowed.`);
          throw new Error(`Invalid file type for ${key}. Only .jpeg, .jpg, and .png are allowed.`);
        }
        
        // Get file metadata from S3
        const headParams = {
          Bucket: bucket,
          Key: key
        };
        
        try {
          const headData = await s3Client.send(new HeadObjectCommand(headParams));
          const contentType = headData.ContentType || 'unknown';
          
          // Record the image in DynamoDB
          const params = {
            TableName: tableName,
            Item: {
              id: key,
              uploadTime: new Date().toISOString(),
              bucket: bucket,
              size: s3Record.s3.object.size,
              contentType: contentType,
              eTag: headData.ETag?.replace(/"/g, '') || null
            }
          };
          
          await ddbDocClient.send(new PutCommand(params));
          console.log(`Successfully logged image: ${key} in DynamoDB`);
        } catch (headErr) {
          console.error(`Error getting S3 object metadata: ${headErr}`);
          throw headErr;
        }
      }
    } catch (error) {
      console.error("Error processing record: ", error);
      // Re-throw to trigger DLQ for image format validation errors
      throw error;
    }
  }
}; 