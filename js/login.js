/*
    可信数据空间登录模拟模块

    实际系统:
    用户名密码 -> 后端验证 -> JWT

    本项目:
    用户名密码 -> JS验证 -> Token模拟

*/



function login(){


    let username =
    document.getElementById("loginUser").value.trim();



    let password =
    document.getElementById("loginPass").value;



    let message =
    document.getElementById("loginMsg");





    //管理员账号

    if(username==="admin" 
        && password==="123456"){



        let userInfo={


            username:"admin",

            role:"admin",

            token:createToken()


        };



        sessionStorage.setItem(

            "user",

            JSON.stringify(userInfo)

        );



        window.location.href="dataspace.html";



    }





    //普通用户


    else if(
        username==="user"
        &&
        password==="123456"
    ){



        let userInfo={


            username:"user",

            role:"user",

            token:createToken()


        };



        sessionStorage.setItem(

            "user",

            JSON.stringify(userInfo)

        );



        window.location.href="dataspace.html";


    }




    else{


        let users=
        JSON.parse(
            localStorage.getItem(
                "dataspace_users"
            ) || "[]"
        );


        let found=
        users.find(
            u=>u.username===username
            && u.password===password
        );


        if(found){

            let userInfo={
                username:found.username,
                role:found.role||"user",
                token:createToken()
            };


            sessionStorage.setItem(
                "user",
                JSON.stringify(userInfo)
            );


            window.location.href=
            "dataspace.html";

        }
        else{

            message.innerHTML=
            "用户名或密码错误";

        }

    }



}





//生成模拟Token

function createToken(){


    return (

        "TDS-"

        +

        Math.random()
        .toString(36)
        .substring(2)

        +

        Date.now()

    );


}


/* 登录 / 注册 表单切换（带滑动动画） */
function switchAuth(target){

    let sw =
    document.querySelector(".auth-switch");

    let loginPanel =
    document.getElementById("loginPanel");

    let regPanel =
    document.getElementById("registerPanel");

    let tabs =
    document.querySelectorAll(".auth-tab");


    if(!sw || !loginPanel || !regPanel){
        return;
    }


    sw.setAttribute("data-active", target);


    if(target==="register"){

        loginPanel.classList.remove("active");
        regPanel.classList.add("active");

    }
    else{

        regPanel.classList.remove("active");
        loginPanel.classList.add("active");

    }


    tabs.forEach(function(t){

        t.classList.toggle(
            "active",
            t.getAttribute("data-target")===target
        );

    });

}


/* 根据 URL 参数 mode=register 默认显示注册面板 */
(function(){

    if(
        location.search.indexOf("mode=register")>-1
    ){

        switchAuth("register");

    }

})();