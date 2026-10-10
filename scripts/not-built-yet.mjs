// Placeholder behind the npm scripts whose real work arrives in a later task.
// It ends without an error on purpose (review of task 0.1, answer 3), so the line below must be loud.
const [script, task] = process.argv.slice(2);

console.log(`NOT BUILT YET: ${script} arrives in task ${task}`);
