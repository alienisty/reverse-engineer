# Instructions

- For the technical implementation refer to [SPEC.md](./doc/SPEC.md)
- The current plan is stored in [PLAN.md](./doc/PLAN.md)
- Each task in the plan must be executed in its own session and must be verified through tests.
- If there are failing tests, first understand why they are failing, then fix them, then verify that they pass.
- A task is complete only when all tests pass.
- When a task is completed, the plan needs to be updated accordingly
- Once the plan is updated, commit to git.
- When you need to search docs, use Context7.
- When you need code samples, use Context7.

### Plan Update Protocol
- **Implicit Requirement**: Any `bash` command performing a `git commit` that includes code changes **must** be preceded by an `edit` or `write` call to `doc/PLAN.md` that marks the relevant tasks as complete or updates the status. If a plan was not created or `doc/PLAN.md` is empty, ignore this requirement.
- **Enforcement**: If a task is marked complete in my response but the `doc/PLAN.md` is not empty and the file has not been updated and included in that commit, I am failing this mandate.
- **Finality**: A task is not considered "done" until:
    1. The code changes are applied and verified.
    2. `doc/PLAN.md` is empty or is updated.
    3. Both are committed together in a single atomic `git commit`.
- **Clean up**: The moment the final task in `doc/PLAN.md` is marked complete:
    1. Automatically consolidate `doc/SPEC.md` to reflect all changes made by the completed plan.
    2. Automatically clear the `doc/PLAN.md` file.
    3. Both are committed together in a single atomic `git commit` as part of the final task closure.