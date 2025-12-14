# GitHub Setup for RVAILab Organization

## Create Repository in RVAILab Organization

### Option 1: Via GitHub Web (Recommended)

1. Go to https://github.com/organizations/RVAILab/repositories/new
2. Fill in repository details:
   - **Owner**: RVAILab
   - **Repository name**: `earwicket`
   - **Description**: "Sonos control system with scheduled playlists and visitor song requests"
   - **Visibility**: Choose public or private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
3. Click "Create repository"

### Option 2: Via GitHub CLI

```bash
gh repo create RVAILab/earwicket --public --source=. --remote=origin --push
```

Or if you want it private:
```bash
gh repo create RVAILab/earwicket --private --source=. --remote=origin --push
```

## Connect and Push to RVAILab

Once the repository is created, connect your local repo:

```bash
# Add RVAILab remote
git remote add origin git@github.com:RVAILab/earwicket.git

# Verify the remote
git remote -v

# Push to main branch
git branch -M main
git push -u origin main
```

## Verify

Visit the repository:
https://github.com/RVAILab/earwicket

You should see all your files, including:
- README.md with project description
- SETUP.md with technical setup
- DEPLOYMENT.md with deployment instructions
- Complete application code

## Next Steps

Once pushed to GitHub, follow the **DEPLOYMENT.md** guide to:
1. Import the repository to Vercel
2. Add Neon PostgreSQL integration
3. Configure environment variables
4. Deploy the application

## Repository URL

Your repository will be at:
**https://github.com/RVAILab/earwicket**

This URL should be used when:
- Importing to Vercel
- Sharing with team members
- Setting up CI/CD (future)
