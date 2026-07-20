/*
    数据上传核心程序

*/


async function uploadFile(){



    let name =
    document.getElementById(
        "dataName"
    ).value;




    let file =
    document.getElementById(
        "fileInput"
    ).files[0];





    let description =
    document.getElementById(
        "description"
    ).value;






    if(!file){


        showAlert(
            "请选择Word文件"
        );


        return;


    }





    // =====================
    // 1.读取文件
    // =====================


    let fileData =
    await readFile(file);







    // =====================
    // 2.生成数据ID
    // =====================


    let dataID =

    "TDS-"

    +

    Date.now();









    // =====================
    // 3.生成Hash
    // =====================



    let hash =

    await sha256(fileData);








    // =====================
    // 4.生成数据对象
    // =====================

    let data={


    id:dataID,


    name:name,


    filename:file.name,


    fileType:file.type,


    storage:
    "Local Secure Storage",


    description:description,


    size:file.size,


    hash:hash,


    owner:
    getCurrentUser().username,


    uploadTime:
    new Date()
    .toLocaleString(),



    content:fileData


    };
    



    // =====================
    // 5.AES加密
    // =====================


    let encrypted = await encryptData(data);







    // =====================
    // 6.保存数据
    // =====================



    localStorage.setItem(

        dataID,

        encrypted

    );







    // =====================
    // 7.写入日志
    // =====================



    writeLog(

        "上传数据",

        dataID

    );









    document.getElementById(
        "result"
    ).innerHTML=


    `

    上传成功!

    <br><br>

    数据编号:

    ${dataID}


    <br><br>

    SHA256:

    ${hash.substring(0,40)}...

    <br><br>

    状态:

    AES加密保护


    `;




}
