# kb-agent nocobase tools (keyless)

## nb_collections()
共 2 个集合：

### experts（专家）
- id: bigInt
- name 姓名: string
- org 机构: string

### orders（专家服务订单）
- id: bigInt
- orderNo 订单号: string
- serviceName 服务名: string
- status 状态: string

## nb_list(orders, status eq pending)
orders 第 1 页（每页 20，共 1 行）
- {"id":101,"orderNo":"ORD-101","serviceName":"中亚货运动线方案","status":"pending"}

## nb_list(orders, serviceName includes 合规) — the fuzzy-match operator
orders 第 1 页（每页 20，共 1 行）
- {"id":102,"orderNo":"ORD-102","serviceName":"出口合规审查","status":"delivered"}

## nb_get(orders, 101) — the pre-change read
orders: {"id":101,"orderNo":"ORD-101","serviceName":"中亚货运动线方案","status":"pending"}

## nb_update(orders, 101, status → shipped) — the confirmed diff receipt
已更新 orders 第 101 行：
- status: "pending" → "shipped"

## nb_get(orders, 101) — the follow-up read
orders: {"id":101,"orderNo":"ORD-101","serviceName":"中亚货运动线方案","status":"shipped"}

## nb_create(orders, ORD-103) — the confirmed create receipt
已在 orders 创建第 201 行：
- orderNo: "ORD-103"
- serviceName: "中亚市场准入咨询"
- status: "pending"
- id: 201
