### Setup Instructions

1. **Install Nodejs** (https://nodejs.org/en/download/)

2. **Install typings** (https://www.npmjs.com/package/typings):
 ```
 npm install typings --global
 ```
3. **Install gulp** (https://gulpjs.com/):
 ```
 npm install gulp-cli -g
 ```
4. Do the following commands **inside your project folder** (the integrated terminal in VS Code is nice for that)
 **Initialize your project** (Give your project a name, for example "screeps". Press enter until you reach the last question, then type "yes"...):
 ```
 npm init
 ```
 **Add Gulp to your Project:**
 ```
 npm install gulp -D
 ```
5. **Set the path constants** to your local screeps folder(s) **in "gulpfile.js"** (You can find your local path by clicking the "Open local folder" button in the Screeps Console of the Steam Client)

---

### How to write Scripts and deploy with Gulp
Place all your game scripts in the "scripts" folder (Already existing Scripts are from the Tutorial).
All .js files are copied to your Screeps Folders (PATH you had set up in gulpfile.js) each time you use the following commands:

 ```
 gulp deploy_1
 ```
 or
 ```
 gulp deploy_2
 ```
---