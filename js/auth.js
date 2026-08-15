/*
    可信数据空间身份认证守卫

    功能:

    1. 检查用户是否登录
    2. 获取当前用户信息
    3. 判断角色权限

*/



function checkLogin(){


    let user =
    getCurrentUser();



    if(!user){


        showAlert(
            "请先登录系统",
            function() {
                window.location.href = "login.html";
            }
        );


        return false;


        return false;


    }


    return true;


}






//获取当前用户

function getCurrentUser(){


    let user =
    sessionStorage.getItem("user");



    if(user){


        return JSON.parse(user);


    }


    // 尝试从本地存储恢复登录态，使注册/登录用户被“记住”
    let remembered =
    localStorage.getItem("tds_user");


    if(remembered){


        sessionStorage.setItem("user", remembered);
        return JSON.parse(remembered);


    }


    return null;


}





//退出登录

function logout(){


    sessionStorage.removeItem(
        "user"
    );


    // 同时清除本地记住的登录态，确保真正退出
    localStorage.removeItem(
        "tds_user"
    );



    window.location.href=
    "login.html";


}







//角色检查

function checkRole(role){


    let user =
    getCurrentUser();



    if(!user){


        return false;


    }



    return user.role===role;


}