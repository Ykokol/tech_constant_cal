// 导航功能
function navigateTo(page) {
    window.location.href = page;
}
// 注册 Service Worker (开启 PWA 离线和安装功能)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('PWA ServiceWorker 注册成功, 作用域为: ', registration.scope);
            })
            .catch(err => {
                console.log('PWA ServiceWorker 注册失败: ', err);
            });
    });
}
