// Example of adjusting membership functions according to the specification

// === OPTION 1: More even distribution ===

// In fuzzyController.js, lines 19-34, replace with:
/*
connectionStrength.addTerm(new Term("Low", "trapeze", [0, 0, 30, 50]));
connectionStrength.addTerm(new Term("Medium", "trapeze", [25, 45, 55, 75]));
connectionStrength.addTerm(new Term("High", "trapeze", [50, 70, 100, 100]));
*/

// In membershipParams, lines 110-130, replace with:
/*
connectionStrength: {
  Low: { type: "trapeze", params: [0, 0, 30, 50] },
  Medium: { type: "trapeze", params: [25, 45, 55, 75] },
  High: { type: "trapeze", params: [50, 70, 100, 100] },
},
*/

// In calculateMembershipValues, lines 156-166, replace with:
/*
if (variable === "connectionStrength") {
  memberships.Low = trapezoidalMF(value, 0, 0, 30, 50);
  memberships.Medium = trapezoidalMF(value, 25, 45, 55, 75);
  memberships.High = trapezoidalMF(value, 50, 70, 100, 100);
}
*/

// === OPTION 2: Based on the technical specification ===
// If the specification defines concrete values, use them instead.
// For example, if the spec requires:

// Inputs - sharper boundaries:
/*
Low: [0, 0, 25, 45]
Medium: [20, 40, 60, 80] 
High: [55, 75, 100, 100]
*/

// Outputs - five evenly spaced levels:
/*
VeryLow: [0, 0, 15]
Low: [10, 25, 40]
Medium: [35, 50, 65]
High: [60, 75, 90]
VeryHigh: [85, 100, 100]
*/

// === STEPS TO APPLY CHANGES ===
/*
1. Edit fuzzyController.js in three places:
   - fuzzyis term definitions (lines 19-34)
   - membershipParams object (lines 110-130)
   - calculateMembershipValues function (lines 156-166)

2. Restart the server:
   pkill -f "node server.js"
   npm start

3. Verify the result:
   curl "http://localhost:3000/api/membership-functions"

4. Review the charts in the browser:
   http://localhost:3000
*/

console.log("This file contains examples for adjusting membership functions");
