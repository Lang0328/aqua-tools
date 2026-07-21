/*
    可信数据空间注册模拟模块

    实际系统:
    用户名密码 -> 后端注册 -> 写入用户库

    本项目:
    用户名密码 -> 本地校验 -> 存入 localStorage "dataspace_users"
    注册成功自动登录 -> dataspace.html
*/



function register(){


    let username =
    document.getElementById("username")
    .value.trim();


    let password =
    document.getElementById("password")
    .value;


    let confirm =
    document.getElementById("confirm")
    .value;


    let message =
    document.getElementById("message");



    if(!username){
        message.innerHTML = "请输入用户名";
        return;
    }


    if(username.length < 3){
        message.innerHTML = "用户名至少 3 个字符";
        return;
    }


    if(!password){
        message.innerHTML = "请输入密码";
        return;
    }


    if(password.length < 6){
        message.innerHTML = "密码至少 6 位";
        return;
    }


    if(password !== confirm){
        message.innerHTML = "两次输入的密码不一致";
        return;
    }



    let users =
    JSON.parse(
        localStorage.getItem(
            "dataspace_users"
        ) || "[]"
    );


    if(
        users.find(
            u => u.username === username
        )
    ){
        message.innerHTML = "该用户名已被注册";
        return;
    }



    users.push({
        username: username,
        password: password,
        role: "user"
    });


    localStorage.setItem(
        "dataspace_users",
        JSON.stringify(users)
    );



    let userInfo = {
        username: username,
        role: "user",
        token: createToken()
    };


    sessionStorage.setItem(
        "user",
        JSON.stringify(userInfo)
    );


    window.location.href = "dataspace.html";

}
