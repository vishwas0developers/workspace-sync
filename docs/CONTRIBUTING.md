# Contributing to WorkspaceSync

Thank you for your interest in contributing to WorkspaceSync! This guide provides a beginner-friendly, step-by-step walkthrough to help you get started with forks, branches, local setup, testing, and opening a Pull Request.

---

## Step-by-Step Contribution Flow

### 1. Fork the Repository
1. Navigate to the WorkspaceSync repository on GitHub.
2. Click the **Fork** button in the top-right corner to create your own copy of the repository under your GitHub account.

### 2. Clone Your Fork
Clone your newly forked repository to your local machine:
```bash
git clone https://github.com/YOUR-USERNAME/workspace-sync.git
cd workspace-sync
```

### 3. Create a Feature or Fix Branch
Always create a descriptive branch for your changes (do not work directly on `main`):
```bash
git checkout -b feature/your-feature-name
# or for bug fixes:
# git checkout -b fix/your-bug-fix-name
```

### 4. Set Up the Project Locally
Install the required dependencies:
```bash
npm install
```

### 5. Make and Test Changes
1. Apply your code edits under `src/` or `cli/`.
2. Compile the TypeScript code to ensure there are no syntax or type errors:
   ```bash
   npm run build
   ```
3. Run the automated tests to verify your changes do not break existing features:
   ```bash
   node --test dist/src/test/remove-project.test.js
   ```

### 6. Keep Your Branch Updated
Keep your branch up to date with the original repository's `main` branch to avoid merge conflicts:
```bash
git remote add upstream https://github.com/original-owner/workspace-sync.git
git fetch upstream
git merge upstream/main
```

### 7. Commit and Push Changes
Commit your changes with clear, descriptive messages and push them to your fork:
```bash
git add .
git commit -m "docs: explain your changes clearly"
git push origin feature/your-feature-name
```

### 8. Open a Pull Request
1. Go to your fork on GitHub.
2. Click the **Compare & pull request** button next to your branch.
3. Fill out the Pull Request template details and click **Create pull request**.

---

## Pull Request Guidelines

When opening a Pull Request, please ensure you include:
- **Description**: A clear summary of the changes, the problem solved, and the reasoning behind your approach.
- **Verification**: Evidence of testing (e.g., test outputs, CLI execution logs).
- **Security Check**: Confirm no credentials, SSH private keys, or passwords are saved or exposed.

---

## Coding, Testing, & Security Expectations

- **Code Quality**: Write clean, self-documenting TypeScript code. Avoid adding external dependencies unless absolutely necessary.
- **Testing**: If you add new commands or modify configuration logic, write corresponding regression tests under `src/test/`.
- **Security**: Never mutate files on remote servers. All remote SSH executions must be strictly read-only and pass validation gates.

---

## Reporting Issues & Suggestions

If you want to report a bug or suggest an improvement without writing code:
1. Open a new **Issue** on the GitHub repository.
2. Provide a clear title, description of the issue, environment information (Node.js version, OS), and steps to reproduce the bug.
