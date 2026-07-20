/*
 文件处理模块

*/


//读取文件


function readFile(file){


    return new Promise(
        
        resolve=>{


        let reader =
        new FileReader();



        reader.onload=function(){


            resolve(
                reader.result
            );


        }



        reader.readAsDataURL(file);



    });


}







//生成文件摘要

async function createHash(data){


    let encoder =
    new TextEncoder();


    let buffer =
    encoder.encode(data);



    let hash =
    await crypto.subtle.digest(
        "SHA-256",
        buffer
    );



    let array =
    Array.from(
        new Uint8Array(hash)
    );



    return array
    .map(
        b=>b.toString(16)
        .padStart(2,"0")
    )
    .join("");

}