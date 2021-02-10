import { task, src, dest } from 'gulp';

//Define your paths to deploy
const SCREEPSPATH1 = "C:\\Users\\juncr\\AppData\\Local\\Screeps\\scripts\\127_0_0_1___21025\\default";
const SCREEPSPATH2 = "E:\\Raul";

//Copies all js Files from scripts to SCREEPSPATH1
task('deploy_1', function () {
    return src('scripts/*.js')
        .pipe(dest(SCREEPSPATH1));
});

//Copies all js Files from scripts to SCREEPSPATH2
task('deploy_2', function () {
    return src('scripts/*.js')
        .pipe(dest(SCREEPSPATH2));
});