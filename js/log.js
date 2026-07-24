/*
    可信数据空间
    数据访问日志模块

*/


// 写入日志

function writeLog(action, dataID){


    let user =
    getCurrentUser();



    if(!user){

        return;

    }




    let logList =
    JSON.parse(

        localStorage.getItem("logs")

        ||

        "[]"

    );





    let log={


        id:
        "LOG-"
        +
        Date.now(),


        username:
        user.username,


        role:
        user.role,


        action:
        action,


        dataID:
        dataID,


        time:
        new Date()
        .toLocaleString()


    };





    logList.push(log);





    localStorage.setItem(

        "logs",

        JSON.stringify(logList)

    );



}