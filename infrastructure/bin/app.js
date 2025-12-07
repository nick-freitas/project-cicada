#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const cdk = __importStar(require("aws-cdk-lib"));
const data_stack_1 = require("../lib/data-stack");
const compute_stack_1 = require("../lib/compute-stack");
const agent_stack_1 = require("../lib/agent-stack");
const api_stack_1 = require("../lib/api-stack");
const auth_stack_1 = require("../lib/auth-stack");
const frontend_stack_1 = require("../lib/frontend-stack");
const monitoring_stack_1 = require("../lib/monitoring-stack");
const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};
// Data layer - S3, DynamoDB, Knowledge Base
const dataStack = new data_stack_1.DataStack(app, 'ProjectCICADADataStack', { env });
// Compute layer - Lambda functions
const computeStack = new compute_stack_1.ComputeStack(app, 'ProjectCICADAComputeStack', {
    env,
    dataStack,
});
// Agent layer - AgentCore agents
const agentStack = new agent_stack_1.AgentStack(app, 'ProjectCICADAAgentStack', {
    env,
    dataStack,
    computeStack,
});
// API layer - API Gateway
const apiStack = new api_stack_1.APIStack(app, 'ProjectCICADAAPIStack', {
    env,
    computeStack,
    agentStack,
});
// Auth layer - Cognito
const authStack = new auth_stack_1.AuthStack(app, 'ProjectCICADAAuthStack', { env });
// Frontend layer - S3 + CloudFront
const frontendStack = new frontend_stack_1.FrontendStack(app, 'ProjectCICADAFrontendStack', {
    env,
    apiStack,
    authStack,
});
// Monitoring layer - CloudWatch
const monitoringStack = new monitoring_stack_1.MonitoringStack(app, 'ProjectCICADAMonitoringStack', {
    env,
    dataStack,
    computeStack,
    apiStack,
});
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLHVDQUFxQztBQUNyQyxpREFBbUM7QUFDbkMsa0RBQThDO0FBQzlDLHdEQUFvRDtBQUNwRCxvREFBZ0Q7QUFDaEQsZ0RBQTRDO0FBQzVDLGtEQUE4QztBQUM5QywwREFBc0Q7QUFDdEQsOERBQTBEO0FBRTFELE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTFCLE1BQU0sR0FBRyxHQUFHO0lBQ1YsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO0lBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7Q0FDdEQsQ0FBQztBQUVGLDRDQUE0QztBQUM1QyxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsR0FBRyxFQUFFLHdCQUF3QixFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUV4RSxtQ0FBbUM7QUFDbkMsTUFBTSxZQUFZLEdBQUcsSUFBSSw0QkFBWSxDQUFDLEdBQUcsRUFBRSwyQkFBMkIsRUFBRTtJQUN0RSxHQUFHO0lBQ0gsU0FBUztDQUNWLENBQUMsQ0FBQztBQUVILGlDQUFpQztBQUNqQyxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUFVLENBQUMsR0FBRyxFQUFFLHlCQUF5QixFQUFFO0lBQ2hFLEdBQUc7SUFDSCxTQUFTO0lBQ1QsWUFBWTtDQUNiLENBQUMsQ0FBQztBQUVILDBCQUEwQjtBQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsR0FBRyxFQUFFLHVCQUF1QixFQUFFO0lBQzFELEdBQUc7SUFDSCxZQUFZO0lBQ1osVUFBVTtDQUNYLENBQUMsQ0FBQztBQUVILHVCQUF1QjtBQUN2QixNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsR0FBRyxFQUFFLHdCQUF3QixFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUV4RSxtQ0FBbUM7QUFDbkMsTUFBTSxhQUFhLEdBQUcsSUFBSSw4QkFBYSxDQUFDLEdBQUcsRUFBRSw0QkFBNEIsRUFBRTtJQUN6RSxHQUFHO0lBQ0gsUUFBUTtJQUNSLFNBQVM7Q0FDVixDQUFDLENBQUM7QUFFSCxnQ0FBZ0M7QUFDaEMsTUFBTSxlQUFlLEdBQUcsSUFBSSxrQ0FBZSxDQUFDLEdBQUcsRUFBRSw4QkFBOEIsRUFBRTtJQUMvRSxHQUFHO0lBQ0gsU0FBUztJQUNULFlBQVk7SUFDWixRQUFRO0NBQ1QsQ0FBQyxDQUFDO0FBRUgsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IERhdGFTdGFjayB9IGZyb20gJy4uL2xpYi9kYXRhLXN0YWNrJztcbmltcG9ydCB7IENvbXB1dGVTdGFjayB9IGZyb20gJy4uL2xpYi9jb21wdXRlLXN0YWNrJztcbmltcG9ydCB7IEFnZW50U3RhY2sgfSBmcm9tICcuLi9saWIvYWdlbnQtc3RhY2snO1xuaW1wb3J0IHsgQVBJU3RhY2sgfSBmcm9tICcuLi9saWIvYXBpLXN0YWNrJztcbmltcG9ydCB7IEF1dGhTdGFjayB9IGZyb20gJy4uL2xpYi9hdXRoLXN0YWNrJztcbmltcG9ydCB7IEZyb250ZW5kU3RhY2sgfSBmcm9tICcuLi9saWIvZnJvbnRlbmQtc3RhY2snO1xuaW1wb3J0IHsgTW9uaXRvcmluZ1N0YWNrIH0gZnJvbSAnLi4vbGliL21vbml0b3Jpbmctc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG5jb25zdCBlbnYgPSB7XG4gIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gIHJlZ2lvbjogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfUkVHSU9OIHx8ICd1cy1lYXN0LTEnLFxufTtcblxuLy8gRGF0YSBsYXllciAtIFMzLCBEeW5hbW9EQiwgS25vd2xlZGdlIEJhc2VcbmNvbnN0IGRhdGFTdGFjayA9IG5ldyBEYXRhU3RhY2soYXBwLCAnUHJvamVjdENJQ0FEQURhdGFTdGFjaycsIHsgZW52IH0pO1xuXG4vLyBDb21wdXRlIGxheWVyIC0gTGFtYmRhIGZ1bmN0aW9uc1xuY29uc3QgY29tcHV0ZVN0YWNrID0gbmV3IENvbXB1dGVTdGFjayhhcHAsICdQcm9qZWN0Q0lDQURBQ29tcHV0ZVN0YWNrJywge1xuICBlbnYsXG4gIGRhdGFTdGFjayxcbn0pO1xuXG4vLyBBZ2VudCBsYXllciAtIEFnZW50Q29yZSBhZ2VudHNcbmNvbnN0IGFnZW50U3RhY2sgPSBuZXcgQWdlbnRTdGFjayhhcHAsICdQcm9qZWN0Q0lDQURBQWdlbnRTdGFjaycsIHtcbiAgZW52LFxuICBkYXRhU3RhY2ssXG4gIGNvbXB1dGVTdGFjayxcbn0pO1xuXG4vLyBBUEkgbGF5ZXIgLSBBUEkgR2F0ZXdheVxuY29uc3QgYXBpU3RhY2sgPSBuZXcgQVBJU3RhY2soYXBwLCAnUHJvamVjdENJQ0FEQUFQSVN0YWNrJywge1xuICBlbnYsXG4gIGNvbXB1dGVTdGFjayxcbiAgYWdlbnRTdGFjayxcbn0pO1xuXG4vLyBBdXRoIGxheWVyIC0gQ29nbml0b1xuY29uc3QgYXV0aFN0YWNrID0gbmV3IEF1dGhTdGFjayhhcHAsICdQcm9qZWN0Q0lDQURBQXV0aFN0YWNrJywgeyBlbnYgfSk7XG5cbi8vIEZyb250ZW5kIGxheWVyIC0gUzMgKyBDbG91ZEZyb250XG5jb25zdCBmcm9udGVuZFN0YWNrID0gbmV3IEZyb250ZW5kU3RhY2soYXBwLCAnUHJvamVjdENJQ0FEQUZyb250ZW5kU3RhY2snLCB7XG4gIGVudixcbiAgYXBpU3RhY2ssXG4gIGF1dGhTdGFjayxcbn0pO1xuXG4vLyBNb25pdG9yaW5nIGxheWVyIC0gQ2xvdWRXYXRjaFxuY29uc3QgbW9uaXRvcmluZ1N0YWNrID0gbmV3IE1vbml0b3JpbmdTdGFjayhhcHAsICdQcm9qZWN0Q0lDQURBTW9uaXRvcmluZ1N0YWNrJywge1xuICBlbnYsXG4gIGRhdGFTdGFjayxcbiAgY29tcHV0ZVN0YWNrLFxuICBhcGlTdGFjayxcbn0pO1xuXG5hcHAuc3ludGgoKTtcbiJdfQ==