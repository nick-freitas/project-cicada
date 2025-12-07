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
const cdk = __importStar(require("aws-cdk-lib"));
const data_stack_1 = require("../lib/data-stack");
const compute_stack_1 = require("../lib/compute-stack");
const agent_stack_1 = require("../lib/agent-stack");
const api_stack_1 = require("../lib/api-stack");
const auth_stack_1 = require("../lib/auth-stack");
const frontend_stack_1 = require("../lib/frontend-stack");
const monitoring_stack_1 = require("../lib/monitoring-stack");
describe('CDK Stack Synthesis', () => {
    let app;
    beforeEach(() => {
        app = new cdk.App();
    });
    test('DataStack synthesizes without errors', () => {
        const stack = new data_stack_1.DataStack(app, 'TestDataStack');
        expect(() => app.synth()).not.toThrow();
    });
    test('ComputeStack synthesizes without errors', () => {
        const dataStack = new data_stack_1.DataStack(app, 'TestDataStack');
        const stack = new compute_stack_1.ComputeStack(app, 'TestComputeStack', { dataStack });
        expect(() => app.synth()).not.toThrow();
    });
    test('AgentStack synthesizes without errors', () => {
        const dataStack = new data_stack_1.DataStack(app, 'TestDataStack');
        const computeStack = new compute_stack_1.ComputeStack(app, 'TestComputeStack', { dataStack });
        const stack = new agent_stack_1.AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
        expect(() => app.synth()).not.toThrow();
    });
    test('APIStack synthesizes without errors', () => {
        const dataStack = new data_stack_1.DataStack(app, 'TestDataStack');
        const computeStack = new compute_stack_1.ComputeStack(app, 'TestComputeStack', { dataStack });
        const agentStack = new agent_stack_1.AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
        const stack = new api_stack_1.APIStack(app, 'TestAPIStack', { computeStack, agentStack });
        expect(() => app.synth()).not.toThrow();
    });
    test('AuthStack synthesizes without errors', () => {
        const stack = new auth_stack_1.AuthStack(app, 'TestAuthStack');
        expect(() => app.synth()).not.toThrow();
    });
    test('FrontendStack synthesizes without errors', () => {
        const dataStack = new data_stack_1.DataStack(app, 'TestDataStack');
        const computeStack = new compute_stack_1.ComputeStack(app, 'TestComputeStack', { dataStack });
        const agentStack = new agent_stack_1.AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
        const apiStack = new api_stack_1.APIStack(app, 'TestAPIStack', { computeStack, agentStack });
        const authStack = new auth_stack_1.AuthStack(app, 'TestAuthStack');
        const stack = new frontend_stack_1.FrontendStack(app, 'TestFrontendStack', { apiStack, authStack });
        expect(() => app.synth()).not.toThrow();
    });
    test('MonitoringStack synthesizes without errors', () => {
        const dataStack = new data_stack_1.DataStack(app, 'TestDataStack');
        const computeStack = new compute_stack_1.ComputeStack(app, 'TestComputeStack', { dataStack });
        const agentStack = new agent_stack_1.AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
        const apiStack = new api_stack_1.APIStack(app, 'TestAPIStack', { computeStack, agentStack });
        const stack = new monitoring_stack_1.MonitoringStack(app, 'TestMonitoringStack', {
            dataStack,
            computeStack,
            apiStack,
        });
        expect(() => app.synth()).not.toThrow();
    });
    test('all stacks synthesize together without errors', () => {
        const dataStack = new data_stack_1.DataStack(app, 'TestDataStack');
        const computeStack = new compute_stack_1.ComputeStack(app, 'TestComputeStack', { dataStack });
        const agentStack = new agent_stack_1.AgentStack(app, 'TestAgentStack', { dataStack, computeStack });
        const apiStack = new api_stack_1.APIStack(app, 'TestAPIStack', { computeStack, agentStack });
        const authStack = new auth_stack_1.AuthStack(app, 'TestAuthStack');
        const frontendStack = new frontend_stack_1.FrontendStack(app, 'TestFrontendStack', { apiStack, authStack });
        const monitoringStack = new monitoring_stack_1.MonitoringStack(app, 'TestMonitoringStack', {
            dataStack,
            computeStack,
            apiStack,
        });
        expect(() => app.synth()).not.toThrow();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2stc3ludGhlc2lzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGFjay1zeW50aGVzaXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxrREFBOEM7QUFDOUMsd0RBQW9EO0FBQ3BELG9EQUFnRDtBQUNoRCxnREFBNEM7QUFDNUMsa0RBQThDO0FBQzlDLDBEQUFzRDtBQUN0RCw4REFBMEQ7QUFFMUQsUUFBUSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtJQUNuQyxJQUFJLEdBQVksQ0FBQztJQUVqQixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO0lBQ3RCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtRQUNoRCxNQUFNLEtBQUssR0FBRyxJQUFJLHNCQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMseUNBQXlDLEVBQUUsR0FBRyxFQUFFO1FBQ25ELE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDdEQsTUFBTSxLQUFLLEdBQUcsSUFBSSw0QkFBWSxDQUFDLEdBQUcsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7UUFDakQsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUM5RSxNQUFNLEtBQUssR0FBRyxJQUFJLHdCQUFVLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7UUFDakYsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxHQUFHLEVBQUU7UUFDL0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUM5RSxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUFVLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7UUFDdEYsTUFBTSxLQUFLLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUM5RSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtRQUNoRCxNQUFNLEtBQUssR0FBRyxJQUFJLHNCQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1FBQ3BELE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsSUFBSSw0QkFBWSxDQUFDLEdBQUcsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDOUUsTUFBTSxVQUFVLEdBQUcsSUFBSSx3QkFBVSxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sUUFBUSxHQUFHLElBQUksb0JBQVEsQ0FBQyxHQUFHLEVBQUUsY0FBYyxFQUFFLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDakYsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RCxNQUFNLEtBQUssR0FBRyxJQUFJLDhCQUFhLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDbkYsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMxQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyw0Q0FBNEMsRUFBRSxHQUFHLEVBQUU7UUFDdEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsR0FBRyxFQUFFLGtCQUFrQixFQUFFLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUM5RSxNQUFNLFVBQVUsR0FBRyxJQUFJLHdCQUFVLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEVBQUUsU0FBUyxFQUFFLFlBQVksRUFBRSxDQUFDLENBQUM7UUFDdEYsTUFBTSxRQUFRLEdBQUcsSUFBSSxvQkFBUSxDQUFDLEdBQUcsRUFBRSxjQUFjLEVBQUUsRUFBRSxZQUFZLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQztRQUNqRixNQUFNLEtBQUssR0FBRyxJQUFJLGtDQUFlLENBQUMsR0FBRyxFQUFFLHFCQUFxQixFQUFFO1lBQzVELFNBQVM7WUFDVCxZQUFZO1lBQ1osUUFBUTtTQUNULENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1FBQ3pELE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDdEQsTUFBTSxZQUFZLEdBQUcsSUFBSSw0QkFBWSxDQUFDLEdBQUcsRUFBRSxrQkFBa0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDOUUsTUFBTSxVQUFVLEdBQUcsSUFBSSx3QkFBVSxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsQ0FBQyxDQUFDO1FBQ3RGLE1BQU0sUUFBUSxHQUFHLElBQUksb0JBQVEsQ0FBQyxHQUFHLEVBQUUsY0FBYyxFQUFFLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFDakYsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUN0RCxNQUFNLGFBQWEsR0FBRyxJQUFJLDhCQUFhLENBQUMsR0FBRyxFQUFFLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDM0YsTUFBTSxlQUFlLEdBQUcsSUFBSSxrQ0FBZSxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsRUFBRTtZQUN0RSxTQUFTO1lBQ1QsWUFBWTtZQUNaLFFBQVE7U0FDVCxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzFDLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgRGF0YVN0YWNrIH0gZnJvbSAnLi4vbGliL2RhdGEtc3RhY2snO1xuaW1wb3J0IHsgQ29tcHV0ZVN0YWNrIH0gZnJvbSAnLi4vbGliL2NvbXB1dGUtc3RhY2snO1xuaW1wb3J0IHsgQWdlbnRTdGFjayB9IGZyb20gJy4uL2xpYi9hZ2VudC1zdGFjayc7XG5pbXBvcnQgeyBBUElTdGFjayB9IGZyb20gJy4uL2xpYi9hcGktc3RhY2snO1xuaW1wb3J0IHsgQXV0aFN0YWNrIH0gZnJvbSAnLi4vbGliL2F1dGgtc3RhY2snO1xuaW1wb3J0IHsgRnJvbnRlbmRTdGFjayB9IGZyb20gJy4uL2xpYi9mcm9udGVuZC1zdGFjayc7XG5pbXBvcnQgeyBNb25pdG9yaW5nU3RhY2sgfSBmcm9tICcuLi9saWIvbW9uaXRvcmluZy1zdGFjayc7XG5cbmRlc2NyaWJlKCdDREsgU3RhY2sgU3ludGhlc2lzJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gIH0pO1xuXG4gIHRlc3QoJ0RhdGFTdGFjayBzeW50aGVzaXplcyB3aXRob3V0IGVycm9ycycsICgpID0+IHtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBEYXRhU3RhY2soYXBwLCAnVGVzdERhdGFTdGFjaycpO1xuICAgIGV4cGVjdCgoKSA9PiBhcHAuc3ludGgoKSkubm90LnRvVGhyb3coKTtcbiAgfSk7XG5cbiAgdGVzdCgnQ29tcHV0ZVN0YWNrIHN5bnRoZXNpemVzIHdpdGhvdXQgZXJyb3JzJywgKCkgPT4ge1xuICAgIGNvbnN0IGRhdGFTdGFjayA9IG5ldyBEYXRhU3RhY2soYXBwLCAnVGVzdERhdGFTdGFjaycpO1xuICAgIGNvbnN0IHN0YWNrID0gbmV3IENvbXB1dGVTdGFjayhhcHAsICdUZXN0Q29tcHV0ZVN0YWNrJywgeyBkYXRhU3RhY2sgfSk7XG4gICAgZXhwZWN0KCgpID0+IGFwcC5zeW50aCgpKS5ub3QudG9UaHJvdygpO1xuICB9KTtcblxuICB0ZXN0KCdBZ2VudFN0YWNrIHN5bnRoZXNpemVzIHdpdGhvdXQgZXJyb3JzJywgKCkgPT4ge1xuICAgIGNvbnN0IGRhdGFTdGFjayA9IG5ldyBEYXRhU3RhY2soYXBwLCAnVGVzdERhdGFTdGFjaycpO1xuICAgIGNvbnN0IGNvbXB1dGVTdGFjayA9IG5ldyBDb21wdXRlU3RhY2soYXBwLCAnVGVzdENvbXB1dGVTdGFjaycsIHsgZGF0YVN0YWNrIH0pO1xuICAgIGNvbnN0IHN0YWNrID0gbmV3IEFnZW50U3RhY2soYXBwLCAnVGVzdEFnZW50U3RhY2snLCB7IGRhdGFTdGFjaywgY29tcHV0ZVN0YWNrIH0pO1xuICAgIGV4cGVjdCgoKSA9PiBhcHAuc3ludGgoKSkubm90LnRvVGhyb3coKTtcbiAgfSk7XG5cbiAgdGVzdCgnQVBJU3RhY2sgc3ludGhlc2l6ZXMgd2l0aG91dCBlcnJvcnMnLCAoKSA9PiB7XG4gICAgY29uc3QgZGF0YVN0YWNrID0gbmV3IERhdGFTdGFjayhhcHAsICdUZXN0RGF0YVN0YWNrJyk7XG4gICAgY29uc3QgY29tcHV0ZVN0YWNrID0gbmV3IENvbXB1dGVTdGFjayhhcHAsICdUZXN0Q29tcHV0ZVN0YWNrJywgeyBkYXRhU3RhY2sgfSk7XG4gICAgY29uc3QgYWdlbnRTdGFjayA9IG5ldyBBZ2VudFN0YWNrKGFwcCwgJ1Rlc3RBZ2VudFN0YWNrJywgeyBkYXRhU3RhY2ssIGNvbXB1dGVTdGFjayB9KTtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBBUElTdGFjayhhcHAsICdUZXN0QVBJU3RhY2snLCB7IGNvbXB1dGVTdGFjaywgYWdlbnRTdGFjayB9KTtcbiAgICBleHBlY3QoKCkgPT4gYXBwLnN5bnRoKCkpLm5vdC50b1Rocm93KCk7XG4gIH0pO1xuXG4gIHRlc3QoJ0F1dGhTdGFjayBzeW50aGVzaXplcyB3aXRob3V0IGVycm9ycycsICgpID0+IHtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBBdXRoU3RhY2soYXBwLCAnVGVzdEF1dGhTdGFjaycpO1xuICAgIGV4cGVjdCgoKSA9PiBhcHAuc3ludGgoKSkubm90LnRvVGhyb3coKTtcbiAgfSk7XG5cbiAgdGVzdCgnRnJvbnRlbmRTdGFjayBzeW50aGVzaXplcyB3aXRob3V0IGVycm9ycycsICgpID0+IHtcbiAgICBjb25zdCBkYXRhU3RhY2sgPSBuZXcgRGF0YVN0YWNrKGFwcCwgJ1Rlc3REYXRhU3RhY2snKTtcbiAgICBjb25zdCBjb21wdXRlU3RhY2sgPSBuZXcgQ29tcHV0ZVN0YWNrKGFwcCwgJ1Rlc3RDb21wdXRlU3RhY2snLCB7IGRhdGFTdGFjayB9KTtcbiAgICBjb25zdCBhZ2VudFN0YWNrID0gbmV3IEFnZW50U3RhY2soYXBwLCAnVGVzdEFnZW50U3RhY2snLCB7IGRhdGFTdGFjaywgY29tcHV0ZVN0YWNrIH0pO1xuICAgIGNvbnN0IGFwaVN0YWNrID0gbmV3IEFQSVN0YWNrKGFwcCwgJ1Rlc3RBUElTdGFjaycsIHsgY29tcHV0ZVN0YWNrLCBhZ2VudFN0YWNrIH0pO1xuICAgIGNvbnN0IGF1dGhTdGFjayA9IG5ldyBBdXRoU3RhY2soYXBwLCAnVGVzdEF1dGhTdGFjaycpO1xuICAgIGNvbnN0IHN0YWNrID0gbmV3IEZyb250ZW5kU3RhY2soYXBwLCAnVGVzdEZyb250ZW5kU3RhY2snLCB7IGFwaVN0YWNrLCBhdXRoU3RhY2sgfSk7XG4gICAgZXhwZWN0KCgpID0+IGFwcC5zeW50aCgpKS5ub3QudG9UaHJvdygpO1xuICB9KTtcblxuICB0ZXN0KCdNb25pdG9yaW5nU3RhY2sgc3ludGhlc2l6ZXMgd2l0aG91dCBlcnJvcnMnLCAoKSA9PiB7XG4gICAgY29uc3QgZGF0YVN0YWNrID0gbmV3IERhdGFTdGFjayhhcHAsICdUZXN0RGF0YVN0YWNrJyk7XG4gICAgY29uc3QgY29tcHV0ZVN0YWNrID0gbmV3IENvbXB1dGVTdGFjayhhcHAsICdUZXN0Q29tcHV0ZVN0YWNrJywgeyBkYXRhU3RhY2sgfSk7XG4gICAgY29uc3QgYWdlbnRTdGFjayA9IG5ldyBBZ2VudFN0YWNrKGFwcCwgJ1Rlc3RBZ2VudFN0YWNrJywgeyBkYXRhU3RhY2ssIGNvbXB1dGVTdGFjayB9KTtcbiAgICBjb25zdCBhcGlTdGFjayA9IG5ldyBBUElTdGFjayhhcHAsICdUZXN0QVBJU3RhY2snLCB7IGNvbXB1dGVTdGFjaywgYWdlbnRTdGFjayB9KTtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBNb25pdG9yaW5nU3RhY2soYXBwLCAnVGVzdE1vbml0b3JpbmdTdGFjaycsIHtcbiAgICAgIGRhdGFTdGFjayxcbiAgICAgIGNvbXB1dGVTdGFjayxcbiAgICAgIGFwaVN0YWNrLFxuICAgIH0pO1xuICAgIGV4cGVjdCgoKSA9PiBhcHAuc3ludGgoKSkubm90LnRvVGhyb3coKTtcbiAgfSk7XG5cbiAgdGVzdCgnYWxsIHN0YWNrcyBzeW50aGVzaXplIHRvZ2V0aGVyIHdpdGhvdXQgZXJyb3JzJywgKCkgPT4ge1xuICAgIGNvbnN0IGRhdGFTdGFjayA9IG5ldyBEYXRhU3RhY2soYXBwLCAnVGVzdERhdGFTdGFjaycpO1xuICAgIGNvbnN0IGNvbXB1dGVTdGFjayA9IG5ldyBDb21wdXRlU3RhY2soYXBwLCAnVGVzdENvbXB1dGVTdGFjaycsIHsgZGF0YVN0YWNrIH0pO1xuICAgIGNvbnN0IGFnZW50U3RhY2sgPSBuZXcgQWdlbnRTdGFjayhhcHAsICdUZXN0QWdlbnRTdGFjaycsIHsgZGF0YVN0YWNrLCBjb21wdXRlU3RhY2sgfSk7XG4gICAgY29uc3QgYXBpU3RhY2sgPSBuZXcgQVBJU3RhY2soYXBwLCAnVGVzdEFQSVN0YWNrJywgeyBjb21wdXRlU3RhY2ssIGFnZW50U3RhY2sgfSk7XG4gICAgY29uc3QgYXV0aFN0YWNrID0gbmV3IEF1dGhTdGFjayhhcHAsICdUZXN0QXV0aFN0YWNrJyk7XG4gICAgY29uc3QgZnJvbnRlbmRTdGFjayA9IG5ldyBGcm9udGVuZFN0YWNrKGFwcCwgJ1Rlc3RGcm9udGVuZFN0YWNrJywgeyBhcGlTdGFjaywgYXV0aFN0YWNrIH0pO1xuICAgIGNvbnN0IG1vbml0b3JpbmdTdGFjayA9IG5ldyBNb25pdG9yaW5nU3RhY2soYXBwLCAnVGVzdE1vbml0b3JpbmdTdGFjaycsIHtcbiAgICAgIGRhdGFTdGFjayxcbiAgICAgIGNvbXB1dGVTdGFjayxcbiAgICAgIGFwaVN0YWNrLFxuICAgIH0pO1xuXG4gICAgZXhwZWN0KCgpID0+IGFwcC5zeW50aCgpKS5ub3QudG9UaHJvdygpO1xuICB9KTtcbn0pO1xuIl19