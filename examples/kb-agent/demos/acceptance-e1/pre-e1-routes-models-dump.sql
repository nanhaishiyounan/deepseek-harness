--
-- PostgreSQL database dump
--

\restrict xVx8cPRkCUzQtXy3wsfBAWQoXVPELSUFhGmKey97zSS0d0SCVZegjaYDyryUoP2

-- Dumped from database version 17.9 (Homebrew)
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: desktopRoutes; Type: TABLE; Schema: public; Owner: nocobase
--

CREATE TABLE public."desktopRoutes" (
    id bigint NOT NULL,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    "parentId" bigint,
    title character varying(255),
    tooltip character varying(255),
    icon character varying(255),
    "schemaUid" character varying(255),
    "menuSchemaUid" character varying(255),
    "tabSchemaName" character varying(255),
    type character varying(255),
    options json,
    sort bigint,
    "hideInMenu" boolean,
    "enableTabs" boolean,
    "enableHeader" boolean,
    "displayTitle" boolean,
    hidden boolean,
    "createdById" bigint,
    "updatedById" bigint
);


ALTER TABLE public."desktopRoutes" OWNER TO nocobase;

--
-- Name: flowModelTreePath; Type: TABLE; Schema: public; Owner: nocobase
--

CREATE TABLE public."flowModelTreePath" (
    ancestor character varying(255) NOT NULL,
    descendant character varying(255) NOT NULL,
    depth integer,
    async boolean,
    type character varying(255),
    sort integer
);


ALTER TABLE public."flowModelTreePath" OWNER TO nocobase;

--
-- Name: COLUMN "flowModelTreePath".type; Type: COMMENT; Schema: public; Owner: nocobase
--

COMMENT ON COLUMN public."flowModelTreePath".type IS 'type of node';


--
-- Name: COLUMN "flowModelTreePath".sort; Type: COMMENT; Schema: public; Owner: nocobase
--

COMMENT ON COLUMN public."flowModelTreePath".sort IS 'sort of node in adjacency';


--
-- Name: flowModels; Type: TABLE; Schema: public; Owner: nocobase
--

CREATE TABLE public."flowModels" (
    uid character varying(255) NOT NULL,
    name character varying(255),
    options json DEFAULT '{}'::json
);


ALTER TABLE public."flowModels" OWNER TO nocobase;

--
-- Data for Name: desktopRoutes; Type: TABLE DATA; Schema: public; Owner: nocobase
--

COPY public."desktopRoutes" (id, "createdAt", "updatedAt", "parentId", title, tooltip, icon, "schemaUid", "menuSchemaUid", "tabSchemaName", type, options, sort, "hideInMenu", "enableTabs", "enableHeader", "displayTitle", hidden, "createdById", "updatedById") FROM stdin;
386332291891200	2026-09-13 03:33:12.821+08	2026-09-13 03:33:12.821+08	\N	CRM 客户	\N	TeamOutlined	\N	\N	\N	group	\N	1	\N	\N	\N	\N	\N	1	1
386332365291520	2026-09-13 03:33:47.692+08	2026-09-13 03:33:47.692+08	386332291891200	销售线索	\N	FlagOutlined	n17rwc527ujwt	\N	\N	flowPage	\N	1	\N	\N	\N	\N	\N	1	1
386332363194368	2026-09-13 03:33:46.868+08	2026-09-13 03:33:46.868+08	386332291891200	客户	\N	ShopOutlined	n17sys042q2lz	\N	\N	flowPage	\N	2	\N	\N	\N	\N	\N	1	1
386332367388672	2026-09-13 03:33:48.448+08	2026-09-13 03:33:48.448+08	386332291891200	联系人	\N	UserOutlined	n17c3lkyg9zjd6	\N	\N	flowPage	\N	3	\N	\N	\N	\N	\N	1	1
386332293988360	2026-09-13 03:33:13.705+08	2026-09-13 03:33:13.912+08	386332291891200	产品与服务	\N	AppstoreOutlined	g50posy0qxc	\N	\N	page	\N	4	\N	\N	\N	\N	\N	1	1
386332293988362	2026-09-13 03:33:13.934+08	2026-09-13 03:33:13.934+08	386332293988360		\N	\N	zglcwwab145	\N	5o8akdc0mxt	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332296085504	2026-09-13 03:33:14.005+08	2026-09-13 03:33:14.122+08	386332291891200	客户仪表盘	\N	DashboardOutlined	w6nyh5dtycq	\N	\N	page	\N	5	\N	\N	\N	\N	\N	1	1
386332296085506	2026-09-13 03:33:14.145+08	2026-09-13 03:33:14.145+08	386332296085504		\N	\N	qfjd61d5wwj	\N	i8j03fx2x2m	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332296085507	2026-09-13 03:33:14.213+08	2026-09-13 03:33:14.213+08	\N	销售流程	\N	DollarOutlined	\N	\N	\N	group	\N	6	\N	\N	\N	\N	\N	1	1
386332369485824	2026-09-13 03:33:49.099+08	2026-09-13 03:33:49.099+08	386332296085507	订单	\N	ProfileOutlined	n17vu68623sj9i	\N	\N	flowPage	\N	1	\N	\N	\N	\N	\N	1	1
386332369485826	2026-09-13 03:33:49.729+08	2026-09-13 03:33:49.729+08	386332296085507	报价单	\N	FileTextOutlined	n17v6xfvzxoj0f	\N	\N	flowPage	\N	2	\N	\N	\N	\N	\N	1	1
386332296085515	2026-09-13 03:33:14.687+08	2026-09-13 03:33:14.803+08	386332296085507	回款	\N	PayCircleOutlined	ihfgg15bm8x	\N	\N	page	\N	3	\N	\N	\N	\N	\N	1	1
386332296085517	2026-09-13 03:33:14.827+08	2026-09-13 03:33:14.827+08	386332296085515		\N	\N	hkr6nvogp0g	\N	f7q4i1veiv1	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332296085518	2026-09-13 03:33:14.896+08	2026-09-13 03:33:15.01+08	386332296085507	发票	\N	AuditOutlined	nx1znh4rs6i	\N	\N	page	\N	4	\N	\N	\N	\N	\N	1	1
386332298182656	2026-09-13 03:33:15.033+08	2026-09-13 03:33:15.033+08	386332296085518		\N	\N	75kqrkvy7gh	\N	f3z0lwfmdoq	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332298182657	2026-09-13 03:33:15.103+08	2026-09-13 03:33:15.216+08	386332296085507	销售仪表盘	\N	BarChartOutlined	x00jse3wllw	\N	\N	page	\N	5	\N	\N	\N	\N	\N	1	1
386332298182659	2026-09-13 03:33:15.239+08	2026-09-13 03:33:15.239+08	386332298182657		\N	\N	hhozqul2o6x	\N	x4javna79sj	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332338028544	2026-09-13 03:33:34.205+08	2026-09-13 03:33:34.32+08	\N	工作台	\N	DashboardOutlined	b4k6wf2zu6k	\N	\N	page	\N	7	\N	\N	\N	\N	\N	1	1
386332338028546	2026-09-13 03:33:34.345+08	2026-09-13 03:33:34.345+08	386332338028544		\N	\N	o8u7f1fk903	\N	7h9hpxsui4a	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332338028547	2026-09-13 03:33:34.51+08	2026-09-13 03:33:34.51+08	\N	项目管理	\N	ProjectOutlined	\N	\N	\N	group	\N	8	\N	\N	\N	\N	\N	1	1
386332338028549	2026-09-13 03:33:34.565+08	2026-09-13 03:33:34.683+08	386332338028547	项目	\N	ContainerOutlined	dspbkroytnp	\N	\N	page	\N	1	\N	\N	\N	\N	\N	1	1
386332338028551	2026-09-13 03:33:34.704+08	2026-09-13 03:33:34.704+08	386332338028549		\N	\N	i67j5504egp	\N	fk1gytu0t8u	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332338028552	2026-09-13 03:33:34.765+08	2026-09-13 03:33:34.879+08	386332338028547	任务看板	\N	AppstoreOutlined	r9152u4r41q	\N	\N	page	\N	2	\N	\N	\N	\N	\N	1	1
386332338028554	2026-09-13 03:33:34.989+08	2026-09-13 03:33:34.989+08	386332338028552		\N	\N	4ahv5yplz0s	\N	i0nt8wjbdxt	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332340125696	2026-09-13 03:33:35.066+08	2026-09-13 03:33:35.176+08	386332338028547	任务列表	\N	OrderedListOutlined	o3n7a0tcssz	\N	\N	page	\N	3	\N	\N	\N	\N	\N	1	1
386332340125698	2026-09-13 03:33:35.193+08	2026-09-13 03:33:35.193+08	386332340125696		\N	\N	nakpzj93jzf	\N	bv91n1zx7sa	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332340125699	2026-09-13 03:33:35.287+08	2026-09-13 03:33:35.387+08	386332338028547	任务日历	\N	CalendarOutlined	f0z48rz5pye	\N	\N	page	\N	4	\N	\N	\N	\N	\N	1	1
386332340125701	2026-09-13 03:33:35.582+08	2026-09-13 03:33:35.582+08	386332340125699		\N	\N	aoxrvu5pb5i	\N	d92u5iken75	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332340125702	2026-09-13 03:33:35.833+08	2026-09-13 03:33:35.995+08	386332338028547	任务甘特	\N	BarChartOutlined	zs3oqvlgqq0	\N	\N	page	\N	5	\N	\N	\N	\N	\N	1	1
386332342222848	2026-09-13 03:33:36.012+08	2026-09-13 03:33:36.012+08	386332340125702		\N	\N	fkmy4jf6x5t	\N	7hu6kjye075	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332342222849	2026-09-13 03:33:36.082+08	2026-09-13 03:33:36.178+08	386332338028547	里程碑	\N	FlagOutlined	rbm53gqk979	\N	\N	page	\N	6	\N	\N	\N	\N	\N	1	1
386332342222851	2026-09-13 03:33:36.196+08	2026-09-13 03:33:36.196+08	386332342222849		\N	\N	wbi7nu9o7iy	\N	biydgna30e7	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332342222852	2026-09-13 03:33:36.257+08	2026-09-13 03:33:36.257+08	\N	工单中心	\N	CustomerServiceOutlined	\N	\N	\N	group	\N	9	\N	\N	\N	\N	\N	1	1
386332371582976	2026-09-13 03:33:50.331+08	2026-09-13 03:33:50.331+08	386332342222852	工单	\N	MessageOutlined	n17etqhllqqa28	\N	\N	flowPage	\N	1	\N	\N	\N	\N	\N	1	1
386332342222857	2026-09-13 03:33:36.527+08	2026-09-13 03:33:36.63+08	386332342222852	知识文章	\N	ReadOutlined	qn9j7laut2c	\N	\N	page	\N	2	\N	\N	\N	\N	\N	1	1
386332342222859	2026-09-13 03:33:36.653+08	2026-09-13 03:33:36.653+08	386332342222857		\N	\N	9amd91p9pjk	\N	vjldgdcv71w	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332342222860	2026-09-13 03:33:36.717+08	2026-09-13 03:33:36.717+08	\N	资产管理	\N	DatabaseOutlined	\N	\N	\N	group	\N	10	\N	\N	\N	\N	\N	1	1
386332344320000	2026-09-13 03:33:37.019+08	2026-09-13 03:33:37.146+08	386332342222860	供应商	\N	ShopOutlined	8bjc6gykw7e	\N	\N	page	\N	2	\N	\N	\N	\N	\N	1	1
386332344320002	2026-09-13 03:33:37.166+08	2026-09-13 03:33:37.166+08	386332344320000		\N	\N	6f098vpu2ja	\N	x441ri3fgvp	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332344320003	2026-09-13 03:33:37.26+08	2026-09-13 03:33:37.37+08	386332342222860	维保记录	\N	ToolOutlined	fiyoi38ke5c	\N	\N	page	\N	3	\N	\N	\N	\N	\N	1	1
386332344320005	2026-09-13 03:33:37.388+08	2026-09-13 03:33:37.388+08	386332344320003		\N	\N	m4az3j2q86f	\N	kopvn19ixrc	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332344320006	2026-09-13 03:33:37.447+08	2026-09-13 03:33:37.447+08	\N	人事管理	\N	TeamOutlined	\N	\N	\N	group	\N	11	\N	\N	\N	\N	\N	1	1
386332344320011	2026-09-13 03:33:37.765+08	2026-09-13 03:33:37.886+08	386332344320006	部门	\N	ApartmentOutlined	kdud3tb3iq6	\N	\N	page	\N	2	\N	\N	\N	\N	\N	1	1
386332344320013	2026-09-13 03:33:37.933+08	2026-09-13 03:33:37.933+08	386332344320011		\N	\N	dq3l8m8yhsc	\N	7lv084n4gbn	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332346417152	2026-09-13 03:33:38+08	2026-09-13 03:33:38.266+08	386332344320006	请假审批	\N	FileProtectOutlined	i7lcu24opl5	\N	\N	page	\N	3	\N	\N	\N	\N	\N	1	1
386332346417154	2026-09-13 03:33:38.299+08	2026-09-13 03:33:38.299+08	386332346417152		\N	\N	2am6xd3zbmi	\N	hi814p7ugsn	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332346417155	2026-09-13 03:33:38.363+08	2026-09-13 03:33:38.363+08	\N	基础数据	\N	BookOutlined	\N	\N	\N	group	\N	12	\N	\N	\N	\N	\N	1	1
386332346417157	2026-09-13 03:33:38.418+08	2026-09-13 03:33:38.516+08	386332346417155	分类维护	\N	TableOutlined	xpcbg0tntto	\N	\N	page	\N	1	\N	\N	\N	\N	\N	1	1
386332346417159	2026-09-13 03:33:38.534+08	2026-09-13 03:33:38.534+08	386332346417157		\N	\N	1ecrb76t6dk	\N	vtljoiyb0qs	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332356902916	2026-09-13 03:33:43.861+08	2026-09-13 03:33:43.861+08	\N	AI 工作台	\N	\N	n13ai2efgqippp44	\N	\N	flowPage	\N	2	\N	\N	\N	\N	\N	1	1
386332356902918	2026-09-13 03:33:43.92+08	2026-09-13 03:33:43.92+08	386332356902916		\N	\N	n13tabhk9bxduic2q	\N	n13tabschezii111e5mu	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332363194369	2026-09-13 03:33:46.912+08	2026-09-13 03:33:46.912+08	386332363194368		\N	\N	n17tnmwqho6hgl	\N	n17tsxvty6gksu5	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332365291521	2026-09-13 03:33:47.738+08	2026-09-13 03:33:47.738+08	386332365291520		\N	\N	n17tfyodvrkcq0d	\N	n17tsoblp44dxdo	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332367388673	2026-09-13 03:33:48.491+08	2026-09-13 03:33:48.491+08	386332367388672		\N	\N	n17t12fezb0kdm6	\N	n17tsyx4hi9lx2nq	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332369485825	2026-09-13 03:33:49.14+08	2026-09-13 03:33:49.14+08	386332369485824		\N	\N	n17tfgec1j85e5d	\N	n17ts1iu72ae360o	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332369485827	2026-09-13 03:33:49.773+08	2026-09-13 03:33:49.773+08	386332369485826		\N	\N	n17tkf0ipg15b6	\N	n17tsbjbawevkg3n	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332371582977	2026-09-13 03:33:50.375+08	2026-09-13 03:33:50.375+08	386332371582976		\N	\N	n17tgpj7uku1rcb	\N	n17tswemea2otkug	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332373680128	2026-09-13 03:33:51.038+08	2026-09-13 03:33:51.038+08	386332342222860	资产台账	\N	HddOutlined	n17wr2jbz8fl2i	\N	\N	flowPage	\N	1	\N	\N	\N	\N	\N	1	1
386332373680129	2026-09-13 03:33:51.08+08	2026-09-13 03:33:51.08+08	386332373680128		\N	\N	n17tx4b835evqu	\N	n17tsjjs78vq2ee	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332373680130	2026-09-13 03:33:51.686+08	2026-09-13 03:33:51.686+08	386332344320006	员工	\N	IdcardOutlined	n17lhe5qyxu1g	\N	\N	flowPage	\N	1	\N	\N	\N	\N	\N	1	1
386332373680131	2026-09-13 03:33:51.729+08	2026-09-13 03:33:51.729+08	386332373680130		\N	\N	n17t2r7mq7n0zol	\N	n17tsmjozco1kh6j	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386332375777282	2026-09-13 03:33:52.593+08	2026-09-13 03:33:52.593+08	386332375777280		\N	\N	nk75hjjv28u	\N	4j8mfkx9pms	tabs	\N	1	\N	\N	\N	\N	\N	1	1
386337270530048	2026-09-13 04:12:46.368+08	2026-09-13 04:12:46.368+08	386332375777280		\N	\N	4bosxnpl7oj	\N	cvv3dnumidp	tabs	\N	2	\N	\N	\N	\N	\N	1	1
386349220102144	2026-09-13 05:47:44.332+08	2026-09-13 05:47:44.332+08	386332375777280		\N	\N	1x4bbxvx2rb	\N	x8j53zwd7nt	tabs	\N	3	\N	\N	\N	\N	\N	1	1
386356906164224	2026-09-13 06:48:49.356+08	2026-09-13 06:48:49.356+08	386332375777280		\N	\N	08l3h3m1vxn	\N	rol5hyglkj4	tabs	\N	4	\N	\N	\N	\N	\N	1	1
386332375777280	2026-09-13 03:33:52.505+08	2026-09-13 07:06:53.363+08	\N	应用中心	\N	AppstoreOutlined	a2uxnbb2x2r	\N	\N	page	\N	1	\N	\N	\N	\N	\N	1	1
386359179476992	2026-09-13 07:06:53.378+08	2026-09-13 07:06:53.378+08	386332375777280		\N	\N	vqnu60n73n5	\N	dqpozewbzc5	tabs	\N	5	\N	\N	\N	\N	\N	1	1
\.


--
-- Data for Name: flowModelTreePath; Type: TABLE DATA; Schema: public; Owner: nocobase
--

COPY public."flowModelTreePath" (ancestor, descendant, depth, async, type, sort) FROM stdin;
79l2vf8w7cn	79l2vf8w7cn	0	f	\N	\N
ys3f98duku9	ys3f98duku9	0	f	\N	\N
4bosxnpl7oj	4bosxnpl7oj	0	f	\N	\N
agn3fjdakip	agn3fjdakip	0	f	\N	\N
de09fofi09u	de09fofi09u	0	f	\N	\N
naprgm2jcj1	naprgm2jcj1	0	f	\N	\N
zglcwwab145	zglcwwab145	0	f	\N	\N
nt2ks1gajeg	nt2ks1gajeg	0	f	\N	\N
qfjd61d5wwj	qfjd61d5wwj	0	f	\N	\N
uidcqvkwpu8	uidcqvkwpu8	0	f	\N	\N
rgfk9hxbfb9	rgfk9hxbfb9	0	f	\N	\N
nnfjnjretaw	nnfjnjretaw	0	f	\N	\N
gt5oag9v76g	gt5oag9v76g	0	f	\N	\N
hkr6nvogp0g	hkr6nvogp0g	0	f	\N	\N
k8cadv7w2oa	k8cadv7w2oa	0	f	\N	\N
75kqrkvy7gh	75kqrkvy7gh	0	f	\N	\N
074p44nxv9i	074p44nxv9i	0	f	\N	\N
hhozqul2o6x	hhozqul2o6x	0	f	\N	\N
0ii7sfdw3fk	0ii7sfdw3fk	0	f	\N	\N
o8u7f1fk903	o8u7f1fk903	0	f	\N	\N
r10klohrj5v	r10klohrj5v	0	f	\N	\N
zcbvtstmsld	zcbvtstmsld	0	f	\N	\N
i67j5504egp	i67j5504egp	0	f	\N	\N
0pt58xonjng	0pt58xonjng	0	f	\N	\N
4ahv5yplz0s	4ahv5yplz0s	0	f	\N	\N
uk5clh3liq9	uk5clh3liq9	0	f	\N	\N
nakpzj93jzf	nakpzj93jzf	0	f	\N	\N
mxbhnn483m8	mxbhnn483m8	0	f	\N	\N
aoxrvu5pb5i	aoxrvu5pb5i	0	f	\N	\N
a7niunhson7	a7niunhson7	0	f	\N	\N
fkmy4jf6x5t	fkmy4jf6x5t	0	f	\N	\N
h7yfvpwrs6t	h7yfvpwrs6t	0	f	\N	\N
wbi7nu9o7iy	wbi7nu9o7iy	0	f	\N	\N
1jcx1bhpfcq	1jcx1bhpfcq	0	f	\N	\N
olomq09w89x	olomq09w89x	0	f	\N	\N
rtcza5qp46f	rtcza5qp46f	0	f	\N	\N
9amd91p9pjk	9amd91p9pjk	0	f	\N	\N
gyxgwl9j2cp	gyxgwl9j2cp	0	f	\N	\N
zv7s6g4hzb1	zv7s6g4hzb1	0	f	\N	\N
d7v3y1zq1g8	d7v3y1zq1g8	0	f	\N	\N
6f098vpu2ja	6f098vpu2ja	0	f	\N	\N
czcci0i6aaj	czcci0i6aaj	0	f	\N	\N
m4az3j2q86f	m4az3j2q86f	0	f	\N	\N
4tynw4yhq5f	4tynw4yhq5f	0	f	\N	\N
3z6u4oy872l	3z6u4oy872l	0	f	\N	\N
xfvfl0w0uy7	xfvfl0w0uy7	0	f	\N	\N
dq3l8m8yhsc	dq3l8m8yhsc	0	f	\N	\N
q3psk92yw3m	q3psk92yw3m	0	f	\N	\N
2am6xd3zbmi	2am6xd3zbmi	0	f	\N	\N
z66lx5fi6lh	z66lx5fi6lh	0	f	\N	\N
p5yz5fbsl20	p5yz5fbsl20	0	f	\N	\N
1ecrb76t6dk	1ecrb76t6dk	0	f	\N	\N
n13ai2efgqippp44	n13ai2efgqippp44	0	f	\N	\N
n13tabhk9bxduic2q	n13tabhk9bxduic2q	0	f	\N	\N
n13pgn06i47yw6k	n13pgn06i47yw6k	0	f	page	\N
n13ai2efgqippp44	n13pgn06i47yw6k	1	\N	\N	1
n13gr4jc953f732j	n13gr4jc953f732j	0	f	grid	\N
n13tabhk9bxduic2q	n13gr4jc953f732j	1	\N	\N	1
n13tabhk9bxduic2q	n13cbpuliis0kqee	2	\N	\N	\N
n13cbpuliis0kqee	n13cbpuliis0kqee	0	f	items	\N
n13gr4jc953f732j	n13cbpuliis0kqee	1	\N	\N	1
n13tabhk9bxduic2q	n13cc862fs6ew4ds	3	\N	\N	\N
n13gr4jc953f732j	n13cc862fs6ew4ds	2	\N	\N	\N
n13cc862fs6ew4ds	n13cc862fs6ew4ds	0	f	items	\N
n13cbpuliis0kqee	n13cc862fs6ew4ds	1	\N	\N	1
n13tabhk9bxduic2q	n13tbqbw50631n7n	2	\N	\N	\N
n13tbqbw50631n7n	n13tbqbw50631n7n	0	f	items	\N
n13gr4jc953f732j	n13tbqbw50631n7n	1	\N	\N	2
n13tabhk9bxduic2q	n13wkt	3	\N	\N	\N
n13gr4jc953f732j	n13wkt	2	\N	\N	\N
n13wkt	n13wkt	0	f	columns	\N
n13tbqbw50631n7n	n13wkt	1	\N	\N	1
n13tabhk9bxduic2q	n13wktf	4	\N	\N	\N
n13gr4jc953f732j	n13wktf	3	\N	\N	\N
n13tbqbw50631n7n	n13wktf	2	\N	\N	\N
n13wktf	n13wktf	0	f	field	\N
n13wkt	n13wktf	1	\N	\N	1
n13tabhk9bxduic2q	n13wks	3	\N	\N	\N
n13gr4jc953f732j	n13wks	2	\N	\N	\N
n13wks	n13wks	0	f	columns	\N
n13tbqbw50631n7n	n13wks	1	\N	\N	2
n13tabhk9bxduic2q	n13wksf	4	\N	\N	\N
n13gr4jc953f732j	n13wksf	3	\N	\N	\N
n13tbqbw50631n7n	n13wksf	2	\N	\N	\N
n13wksf	n13wksf	0	f	field	\N
n13wks	n13wksf	1	\N	\N	1
n13tabhk9bxduic2q	n13wkp	3	\N	\N	\N
n13gr4jc953f732j	n13wkp	2	\N	\N	\N
n13wkp	n13wkp	0	f	columns	\N
n13tbqbw50631n7n	n13wkp	1	\N	\N	3
n13tabhk9bxduic2q	n13wkpf	4	\N	\N	\N
n13gr4jc953f732j	n13wkpf	3	\N	\N	\N
n13tbqbw50631n7n	n13wkpf	2	\N	\N	\N
n13wkpf	n13wkpf	0	f	field	\N
n13wkp	n13wkpf	1	\N	\N	1
n17sys042q2lz	n17sys042q2lz	0	f	\N	\N
n17tnmwqho6hgl	n17tnmwqho6hgl	0	f	\N	\N
n17parciev0wgwh	n17parciev0wgwh	0	f	page	\N
n17sys042q2lz	n17parciev0wgwh	1	\N	\N	1
n17gvcpaqeznhk	n17gvcpaqeznhk	0	f	grid	\N
n17tnmwqho6hgl	n17gvcpaqeznhk	1	\N	\N	1
n17tnmwqho6hgl	n17tbgfz3oq90r98	2	\N	\N	\N
n17tbgfz3oq90r98	n17tbgfz3oq90r98	0	f	items	\N
n17gvcpaqeznhk	n17tbgfz3oq90r98	1	\N	\N	1
n17tnmwqho6hgl	n17cp7hibgml8mm	3	\N	\N	\N
n17gvcpaqeznhk	n17cp7hibgml8mm	2	\N	\N	\N
n17cp7hibgml8mm	n17cp7hibgml8mm	0	f	columns	\N
n17tbgfz3oq90r98	n17cp7hibgml8mm	1	\N	\N	1
n17tnmwqho6hgl	n17cp7hibgml8mmf	4	\N	\N	\N
n17gvcpaqeznhk	n17cp7hibgml8mmf	3	\N	\N	\N
n17tbgfz3oq90r98	n17cp7hibgml8mmf	2	\N	\N	\N
n17cp7hibgml8mmf	n17cp7hibgml8mmf	0	f	field	\N
n17cp7hibgml8mm	n17cp7hibgml8mmf	1	\N	\N	1
n17tnmwqho6hgl	n17cqmq4hqagsbr	3	\N	\N	\N
n17gvcpaqeznhk	n17cqmq4hqagsbr	2	\N	\N	\N
n17cqmq4hqagsbr	n17cqmq4hqagsbr	0	f	columns	\N
n17tbgfz3oq90r98	n17cqmq4hqagsbr	1	\N	\N	2
n17tnmwqho6hgl	n17cqmq4hqagsbrf	4	\N	\N	\N
n17gvcpaqeznhk	n17cqmq4hqagsbrf	3	\N	\N	\N
n17tbgfz3oq90r98	n17cqmq4hqagsbrf	2	\N	\N	\N
n17cqmq4hqagsbrf	n17cqmq4hqagsbrf	0	f	field	\N
n17cqmq4hqagsbr	n17cqmq4hqagsbrf	1	\N	\N	1
n17tnmwqho6hgl	n17cfoiw9at9rz	3	\N	\N	\N
n17gvcpaqeznhk	n17cfoiw9at9rz	2	\N	\N	\N
n17cfoiw9at9rz	n17cfoiw9at9rz	0	f	columns	\N
n17tbgfz3oq90r98	n17cfoiw9at9rz	1	\N	\N	3
n17tnmwqho6hgl	n17cfoiw9at9rzf	4	\N	\N	\N
n17gvcpaqeznhk	n17cfoiw9at9rzf	3	\N	\N	\N
n17tbgfz3oq90r98	n17cfoiw9at9rzf	2	\N	\N	\N
n17cfoiw9at9rzf	n17cfoiw9at9rzf	0	f	field	\N
n17cfoiw9at9rz	n17cfoiw9at9rzf	1	\N	\N	1
n17tnmwqho6hgl	n17cg4jvxo0ldnp	3	\N	\N	\N
n17gvcpaqeznhk	n17cg4jvxo0ldnp	2	\N	\N	\N
n17cg4jvxo0ldnp	n17cg4jvxo0ldnp	0	f	columns	\N
n17tbgfz3oq90r98	n17cg4jvxo0ldnp	1	\N	\N	4
n17tnmwqho6hgl	n17cg4jvxo0ldnpf	4	\N	\N	\N
n17gvcpaqeznhk	n17cg4jvxo0ldnpf	3	\N	\N	\N
n17tbgfz3oq90r98	n17cg4jvxo0ldnpf	2	\N	\N	\N
n17cg4jvxo0ldnpf	n17cg4jvxo0ldnpf	0	f	field	\N
n17cg4jvxo0ldnp	n17cg4jvxo0ldnpf	1	\N	\N	1
n17tnmwqho6hgl	n17c15fez1adt8j	3	\N	\N	\N
n17gvcpaqeznhk	n17c15fez1adt8j	2	\N	\N	\N
n17c15fez1adt8j	n17c15fez1adt8j	0	f	columns	\N
n17tbgfz3oq90r98	n17c15fez1adt8j	1	\N	\N	5
n17tnmwqho6hgl	n17c15fez1adt8jf	4	\N	\N	\N
n17gvcpaqeznhk	n17c15fez1adt8jf	3	\N	\N	\N
n17tbgfz3oq90r98	n17c15fez1adt8jf	2	\N	\N	\N
n17c15fez1adt8jf	n17c15fez1adt8jf	0	f	field	\N
n17c15fez1adt8j	n17c15fez1adt8jf	1	\N	\N	1
n17tnmwqho6hgl	n17cuh5soevyzef	3	\N	\N	\N
n17gvcpaqeznhk	n17cuh5soevyzef	2	\N	\N	\N
n17cuh5soevyzef	n17cuh5soevyzef	0	f	columns	\N
n17tbgfz3oq90r98	n17cuh5soevyzef	1	\N	\N	6
n17tnmwqho6hgl	n17cuh5soevyzeff	4	\N	\N	\N
n17gvcpaqeznhk	n17cuh5soevyzeff	3	\N	\N	\N
n17tbgfz3oq90r98	n17cuh5soevyzeff	2	\N	\N	\N
n17cuh5soevyzeff	n17cuh5soevyzeff	0	f	field	\N
n17cuh5soevyzef	n17cuh5soevyzeff	1	\N	\N	1
n17tnmwqho6hgl	n17an3pzasuzakqa	3	\N	\N	\N
n17gvcpaqeznhk	n17an3pzasuzakqa	2	\N	\N	\N
n17an3pzasuzakqa	n17an3pzasuzakqa	0	f	actions	\N
n17tbgfz3oq90r98	n17an3pzasuzakqa	1	\N	\N	1
n17tnmwqho6hgl	rmwvn2jti6p	4	\N	\N	\N
n17gvcpaqeznhk	rmwvn2jti6p	3	\N	\N	\N
n17tbgfz3oq90r98	rmwvn2jti6p	2	\N	\N	\N
rmwvn2jti6p	rmwvn2jti6p	0	f	page	\N
n17an3pzasuzakqa	rmwvn2jti6p	1	\N	\N	1
n17tnmwqho6hgl	jqhsxkjhjqx	5	\N	\N	\N
n17gvcpaqeznhk	jqhsxkjhjqx	4	\N	\N	\N
n17tbgfz3oq90r98	jqhsxkjhjqx	3	\N	\N	\N
n17an3pzasuzakqa	jqhsxkjhjqx	2	\N	\N	\N
jqhsxkjhjqx	jqhsxkjhjqx	0	f	tabs	\N
rmwvn2jti6p	jqhsxkjhjqx	1	\N	\N	1
n17tnmwqho6hgl	5p1pe58rs68	6	\N	\N	\N
n17gvcpaqeznhk	5p1pe58rs68	5	\N	\N	\N
n17tbgfz3oq90r98	5p1pe58rs68	4	\N	\N	\N
n17an3pzasuzakqa	5p1pe58rs68	3	\N	\N	\N
rmwvn2jti6p	5p1pe58rs68	2	\N	\N	\N
5p1pe58rs68	5p1pe58rs68	0	f	grid	\N
jqhsxkjhjqx	5p1pe58rs68	1	\N	\N	1
n17tnmwqho6hgl	dy1sditid2j	7	\N	\N	\N
n17gvcpaqeznhk	dy1sditid2j	6	\N	\N	\N
n17tbgfz3oq90r98	dy1sditid2j	5	\N	\N	\N
n17an3pzasuzakqa	dy1sditid2j	4	\N	\N	\N
rmwvn2jti6p	dy1sditid2j	3	\N	\N	\N
jqhsxkjhjqx	dy1sditid2j	2	\N	\N	\N
dy1sditid2j	dy1sditid2j	0	f	items	\N
5p1pe58rs68	dy1sditid2j	1	\N	\N	1
n17tnmwqho6hgl	3q53gu9khsl	8	\N	\N	\N
n17gvcpaqeznhk	3q53gu9khsl	7	\N	\N	\N
n17tbgfz3oq90r98	3q53gu9khsl	6	\N	\N	\N
n17an3pzasuzakqa	3q53gu9khsl	5	\N	\N	\N
rmwvn2jti6p	3q53gu9khsl	4	\N	\N	\N
jqhsxkjhjqx	3q53gu9khsl	3	\N	\N	\N
5p1pe58rs68	3q53gu9khsl	2	\N	\N	\N
3q53gu9khsl	3q53gu9khsl	0	f	grid	\N
dy1sditid2j	3q53gu9khsl	1	\N	\N	1
n17tnmwqho6hgl	n17i7p67xwukfto	9	\N	\N	\N
n17gvcpaqeznhk	n17i7p67xwukfto	8	\N	\N	\N
n17tbgfz3oq90r98	n17i7p67xwukfto	7	\N	\N	\N
n17an3pzasuzakqa	n17i7p67xwukfto	6	\N	\N	\N
rmwvn2jti6p	n17i7p67xwukfto	5	\N	\N	\N
jqhsxkjhjqx	n17i7p67xwukfto	4	\N	\N	\N
5p1pe58rs68	n17i7p67xwukfto	3	\N	\N	\N
dy1sditid2j	n17i7p67xwukfto	2	\N	\N	\N
n17i7p67xwukfto	n17i7p67xwukfto	0	f	items	\N
3q53gu9khsl	n17i7p67xwukfto	1	\N	\N	1
n17tnmwqho6hgl	tolll70hteh	10	\N	\N	\N
n17gvcpaqeznhk	tolll70hteh	9	\N	\N	\N
n17tbgfz3oq90r98	tolll70hteh	8	\N	\N	\N
n17an3pzasuzakqa	tolll70hteh	7	\N	\N	\N
rmwvn2jti6p	tolll70hteh	6	\N	\N	\N
jqhsxkjhjqx	tolll70hteh	5	\N	\N	\N
5p1pe58rs68	tolll70hteh	4	\N	\N	\N
dy1sditid2j	tolll70hteh	3	\N	\N	\N
3q53gu9khsl	tolll70hteh	2	\N	\N	\N
tolll70hteh	tolll70hteh	0	f	field	\N
n17i7p67xwukfto	tolll70hteh	1	\N	\N	1
n17tnmwqho6hgl	n17ikzxfi9tqsy	9	\N	\N	\N
n17gvcpaqeznhk	n17ikzxfi9tqsy	8	\N	\N	\N
n17tbgfz3oq90r98	n17ikzxfi9tqsy	7	\N	\N	\N
n17an3pzasuzakqa	n17ikzxfi9tqsy	6	\N	\N	\N
rmwvn2jti6p	n17ikzxfi9tqsy	5	\N	\N	\N
jqhsxkjhjqx	n17ikzxfi9tqsy	4	\N	\N	\N
5p1pe58rs68	n17ikzxfi9tqsy	3	\N	\N	\N
dy1sditid2j	n17ikzxfi9tqsy	2	\N	\N	\N
n17ikzxfi9tqsy	n17ikzxfi9tqsy	0	f	items	\N
3q53gu9khsl	n17ikzxfi9tqsy	1	\N	\N	2
n17tnmwqho6hgl	mcz4f4010io	10	\N	\N	\N
n17gvcpaqeznhk	mcz4f4010io	9	\N	\N	\N
n17tbgfz3oq90r98	mcz4f4010io	8	\N	\N	\N
n17an3pzasuzakqa	mcz4f4010io	7	\N	\N	\N
rmwvn2jti6p	mcz4f4010io	6	\N	\N	\N
1x4bbxvx2rb	1x4bbxvx2rb	0	f	\N	\N
jqhsxkjhjqx	mcz4f4010io	5	\N	\N	\N
5p1pe58rs68	mcz4f4010io	4	\N	\N	\N
dy1sditid2j	mcz4f4010io	3	\N	\N	\N
3q53gu9khsl	mcz4f4010io	2	\N	\N	\N
mcz4f4010io	mcz4f4010io	0	f	field	\N
n17ikzxfi9tqsy	mcz4f4010io	1	\N	\N	1
n17tnmwqho6hgl	n17ir5aq0raikt	9	\N	\N	\N
n17gvcpaqeznhk	n17ir5aq0raikt	8	\N	\N	\N
n17tbgfz3oq90r98	n17ir5aq0raikt	7	\N	\N	\N
n17an3pzasuzakqa	n17ir5aq0raikt	6	\N	\N	\N
rmwvn2jti6p	n17ir5aq0raikt	5	\N	\N	\N
jqhsxkjhjqx	n17ir5aq0raikt	4	\N	\N	\N
5p1pe58rs68	n17ir5aq0raikt	3	\N	\N	\N
dy1sditid2j	n17ir5aq0raikt	2	\N	\N	\N
n17ir5aq0raikt	n17ir5aq0raikt	0	f	items	\N
3q53gu9khsl	n17ir5aq0raikt	1	\N	\N	3
n17tnmwqho6hgl	p254h0rrah3	10	\N	\N	\N
n17gvcpaqeznhk	p254h0rrah3	9	\N	\N	\N
n17tbgfz3oq90r98	p254h0rrah3	8	\N	\N	\N
n17an3pzasuzakqa	p254h0rrah3	7	\N	\N	\N
rmwvn2jti6p	p254h0rrah3	6	\N	\N	\N
jqhsxkjhjqx	p254h0rrah3	5	\N	\N	\N
5p1pe58rs68	p254h0rrah3	4	\N	\N	\N
dy1sditid2j	p254h0rrah3	3	\N	\N	\N
3q53gu9khsl	p254h0rrah3	2	\N	\N	\N
p254h0rrah3	p254h0rrah3	0	f	field	\N
n17ir5aq0raikt	p254h0rrah3	1	\N	\N	1
n17tnmwqho6hgl	n17iwo5cr8y02ac	9	\N	\N	\N
n17gvcpaqeznhk	n17iwo5cr8y02ac	8	\N	\N	\N
n17tbgfz3oq90r98	n17iwo5cr8y02ac	7	\N	\N	\N
n17an3pzasuzakqa	n17iwo5cr8y02ac	6	\N	\N	\N
rmwvn2jti6p	n17iwo5cr8y02ac	5	\N	\N	\N
jqhsxkjhjqx	n17iwo5cr8y02ac	4	\N	\N	\N
5p1pe58rs68	n17iwo5cr8y02ac	3	\N	\N	\N
dy1sditid2j	n17iwo5cr8y02ac	2	\N	\N	\N
n17iwo5cr8y02ac	n17iwo5cr8y02ac	0	f	items	\N
3q53gu9khsl	n17iwo5cr8y02ac	1	\N	\N	4
n17tnmwqho6hgl	coo6zw29rq8	10	\N	\N	\N
n17gvcpaqeznhk	coo6zw29rq8	9	\N	\N	\N
n17tbgfz3oq90r98	coo6zw29rq8	8	\N	\N	\N
n17an3pzasuzakqa	coo6zw29rq8	7	\N	\N	\N
rmwvn2jti6p	coo6zw29rq8	6	\N	\N	\N
jqhsxkjhjqx	coo6zw29rq8	5	\N	\N	\N
5p1pe58rs68	coo6zw29rq8	4	\N	\N	\N
dy1sditid2j	coo6zw29rq8	3	\N	\N	\N
3q53gu9khsl	coo6zw29rq8	2	\N	\N	\N
coo6zw29rq8	coo6zw29rq8	0	f	field	\N
n17iwo5cr8y02ac	coo6zw29rq8	1	\N	\N	1
n17tnmwqho6hgl	n17ilb01hvf5hk	9	\N	\N	\N
n17gvcpaqeznhk	n17ilb01hvf5hk	8	\N	\N	\N
n17tbgfz3oq90r98	n17ilb01hvf5hk	7	\N	\N	\N
n17an3pzasuzakqa	n17ilb01hvf5hk	6	\N	\N	\N
rmwvn2jti6p	n17ilb01hvf5hk	5	\N	\N	\N
jqhsxkjhjqx	n17ilb01hvf5hk	4	\N	\N	\N
5p1pe58rs68	n17ilb01hvf5hk	3	\N	\N	\N
dy1sditid2j	n17ilb01hvf5hk	2	\N	\N	\N
n17ilb01hvf5hk	n17ilb01hvf5hk	0	f	items	\N
3q53gu9khsl	n17ilb01hvf5hk	1	\N	\N	5
n17tnmwqho6hgl	baugmttob2e	10	\N	\N	\N
n17gvcpaqeznhk	baugmttob2e	9	\N	\N	\N
n17tbgfz3oq90r98	baugmttob2e	8	\N	\N	\N
n17an3pzasuzakqa	baugmttob2e	7	\N	\N	\N
rmwvn2jti6p	baugmttob2e	6	\N	\N	\N
jqhsxkjhjqx	baugmttob2e	5	\N	\N	\N
5p1pe58rs68	baugmttob2e	4	\N	\N	\N
dy1sditid2j	baugmttob2e	3	\N	\N	\N
3q53gu9khsl	baugmttob2e	2	\N	\N	\N
baugmttob2e	baugmttob2e	0	f	field	\N
n17ilb01hvf5hk	baugmttob2e	1	\N	\N	1
n17tnmwqho6hgl	n17iseoq8ddcjqe	9	\N	\N	\N
n17gvcpaqeznhk	n17iseoq8ddcjqe	8	\N	\N	\N
n17tbgfz3oq90r98	n17iseoq8ddcjqe	7	\N	\N	\N
n17an3pzasuzakqa	n17iseoq8ddcjqe	6	\N	\N	\N
rmwvn2jti6p	n17iseoq8ddcjqe	5	\N	\N	\N
jqhsxkjhjqx	n17iseoq8ddcjqe	4	\N	\N	\N
5p1pe58rs68	n17iseoq8ddcjqe	3	\N	\N	\N
dy1sditid2j	n17iseoq8ddcjqe	2	\N	\N	\N
n17iseoq8ddcjqe	n17iseoq8ddcjqe	0	f	items	\N
3q53gu9khsl	n17iseoq8ddcjqe	1	\N	\N	6
n17tnmwqho6hgl	cf503q32l9j	10	\N	\N	\N
n17gvcpaqeznhk	cf503q32l9j	9	\N	\N	\N
n17tbgfz3oq90r98	cf503q32l9j	8	\N	\N	\N
n17an3pzasuzakqa	cf503q32l9j	7	\N	\N	\N
rmwvn2jti6p	cf503q32l9j	6	\N	\N	\N
jqhsxkjhjqx	cf503q32l9j	5	\N	\N	\N
5p1pe58rs68	cf503q32l9j	4	\N	\N	\N
dy1sditid2j	cf503q32l9j	3	\N	\N	\N
3q53gu9khsl	cf503q32l9j	2	\N	\N	\N
cf503q32l9j	cf503q32l9j	0	f	field	\N
n17iseoq8ddcjqe	cf503q32l9j	1	\N	\N	1
n17tnmwqho6hgl	n17rfzb9nkudga3k	3	\N	\N	\N
n17gvcpaqeznhk	n17rfzb9nkudga3k	2	\N	\N	\N
n17rfzb9nkudga3k	n17rfzb9nkudga3k	0	f	actions	\N
n17tbgfz3oq90r98	n17rfzb9nkudga3k	1	\N	\N	2
n17rwc527ujwt	n17rwc527ujwt	0	f	\N	\N
n17tfyodvrkcq0d	n17tfyodvrkcq0d	0	f	\N	\N
n17p0iib10y1e9x	n17p0iib10y1e9x	0	f	page	\N
n17rwc527ujwt	n17p0iib10y1e9x	1	\N	\N	1
n17gksef074rhx	n17gksef074rhx	0	f	grid	\N
n17tfyodvrkcq0d	n17gksef074rhx	1	\N	\N	1
n17tfyodvrkcq0d	n17tb34ir6hawk2h	2	\N	\N	\N
n17tb34ir6hawk2h	n17tb34ir6hawk2h	0	f	items	\N
n17gksef074rhx	n17tb34ir6hawk2h	1	\N	\N	1
n17tfyodvrkcq0d	n17cyw3hdcdo98s	3	\N	\N	\N
n17gksef074rhx	n17cyw3hdcdo98s	2	\N	\N	\N
n17cyw3hdcdo98s	n17cyw3hdcdo98s	0	f	columns	\N
n17tb34ir6hawk2h	n17cyw3hdcdo98s	1	\N	\N	1
n17tfyodvrkcq0d	n17cyw3hdcdo98sf	4	\N	\N	\N
n17gksef074rhx	n17cyw3hdcdo98sf	3	\N	\N	\N
n17tb34ir6hawk2h	n17cyw3hdcdo98sf	2	\N	\N	\N
n17cyw3hdcdo98sf	n17cyw3hdcdo98sf	0	f	field	\N
n17cyw3hdcdo98s	n17cyw3hdcdo98sf	1	\N	\N	1
n17tfyodvrkcq0d	n17cst2yk5l3n5	3	\N	\N	\N
n17gksef074rhx	n17cst2yk5l3n5	2	\N	\N	\N
n17cst2yk5l3n5	n17cst2yk5l3n5	0	f	columns	\N
n17tb34ir6hawk2h	n17cst2yk5l3n5	1	\N	\N	2
n17tfyodvrkcq0d	n17cst2yk5l3n5f	4	\N	\N	\N
n17gksef074rhx	n17cst2yk5l3n5f	3	\N	\N	\N
n17tb34ir6hawk2h	n17cst2yk5l3n5f	2	\N	\N	\N
n17cst2yk5l3n5f	n17cst2yk5l3n5f	0	f	field	\N
n17cst2yk5l3n5	n17cst2yk5l3n5f	1	\N	\N	1
n17tfyodvrkcq0d	n17cdnpflwji8w4	3	\N	\N	\N
n17gksef074rhx	n17cdnpflwji8w4	2	\N	\N	\N
n17cdnpflwji8w4	n17cdnpflwji8w4	0	f	columns	\N
n17tb34ir6hawk2h	n17cdnpflwji8w4	1	\N	\N	3
n17tfyodvrkcq0d	n17cdnpflwji8w4f	4	\N	\N	\N
n17gksef074rhx	n17cdnpflwji8w4f	3	\N	\N	\N
n17tb34ir6hawk2h	n17cdnpflwji8w4f	2	\N	\N	\N
n17cdnpflwji8w4f	n17cdnpflwji8w4f	0	f	field	\N
n17cdnpflwji8w4	n17cdnpflwji8w4f	1	\N	\N	1
n17tfyodvrkcq0d	n17cqlea2exr3e	3	\N	\N	\N
n17gksef074rhx	n17cqlea2exr3e	2	\N	\N	\N
n17cqlea2exr3e	n17cqlea2exr3e	0	f	columns	\N
n17tb34ir6hawk2h	n17cqlea2exr3e	1	\N	\N	4
n17tfyodvrkcq0d	n17cqlea2exr3ef	4	\N	\N	\N
n17gksef074rhx	n17cqlea2exr3ef	3	\N	\N	\N
n17tb34ir6hawk2h	n17cqlea2exr3ef	2	\N	\N	\N
n17cqlea2exr3ef	n17cqlea2exr3ef	0	f	field	\N
n17cqlea2exr3e	n17cqlea2exr3ef	1	\N	\N	1
n17tfyodvrkcq0d	n17cf4njh9jtlt	3	\N	\N	\N
n17gksef074rhx	n17cf4njh9jtlt	2	\N	\N	\N
n17cf4njh9jtlt	n17cf4njh9jtlt	0	f	columns	\N
n17tb34ir6hawk2h	n17cf4njh9jtlt	1	\N	\N	5
n17tfyodvrkcq0d	n17cf4njh9jtltf	4	\N	\N	\N
n17gksef074rhx	n17cf4njh9jtltf	3	\N	\N	\N
n17tb34ir6hawk2h	n17cf4njh9jtltf	2	\N	\N	\N
n17cf4njh9jtltf	n17cf4njh9jtltf	0	f	field	\N
n17cf4njh9jtlt	n17cf4njh9jtltf	1	\N	\N	1
n17tfyodvrkcq0d	n17an0vjd9gwrc3c	3	\N	\N	\N
n17gksef074rhx	n17an0vjd9gwrc3c	2	\N	\N	\N
n17an0vjd9gwrc3c	n17an0vjd9gwrc3c	0	f	actions	\N
n17tb34ir6hawk2h	n17an0vjd9gwrc3c	1	\N	\N	1
n17tfyodvrkcq0d	ecductxt41c	4	\N	\N	\N
n17gksef074rhx	ecductxt41c	3	\N	\N	\N
n17tb34ir6hawk2h	ecductxt41c	2	\N	\N	\N
ecductxt41c	ecductxt41c	0	f	page	\N
n17an0vjd9gwrc3c	ecductxt41c	1	\N	\N	1
n17tfyodvrkcq0d	wnv9hj3i2cg	5	\N	\N	\N
n17gksef074rhx	wnv9hj3i2cg	4	\N	\N	\N
n17tb34ir6hawk2h	wnv9hj3i2cg	3	\N	\N	\N
n17an0vjd9gwrc3c	wnv9hj3i2cg	2	\N	\N	\N
wnv9hj3i2cg	wnv9hj3i2cg	0	f	tabs	\N
ecductxt41c	wnv9hj3i2cg	1	\N	\N	1
n17tfyodvrkcq0d	ie0pp6rvvhe	6	\N	\N	\N
n17gksef074rhx	ie0pp6rvvhe	5	\N	\N	\N
n17tb34ir6hawk2h	ie0pp6rvvhe	4	\N	\N	\N
n17an0vjd9gwrc3c	ie0pp6rvvhe	3	\N	\N	\N
ecductxt41c	ie0pp6rvvhe	2	\N	\N	\N
ie0pp6rvvhe	ie0pp6rvvhe	0	f	grid	\N
wnv9hj3i2cg	ie0pp6rvvhe	1	\N	\N	1
n17tfyodvrkcq0d	wqlv319eqdf	7	\N	\N	\N
n17gksef074rhx	wqlv319eqdf	6	\N	\N	\N
n17tb34ir6hawk2h	wqlv319eqdf	5	\N	\N	\N
n17an0vjd9gwrc3c	wqlv319eqdf	4	\N	\N	\N
ecductxt41c	wqlv319eqdf	3	\N	\N	\N
wnv9hj3i2cg	wqlv319eqdf	2	\N	\N	\N
wqlv319eqdf	wqlv319eqdf	0	f	items	\N
ie0pp6rvvhe	wqlv319eqdf	1	\N	\N	1
n17tfyodvrkcq0d	7w13qv5b5lj	8	\N	\N	\N
n17gksef074rhx	7w13qv5b5lj	7	\N	\N	\N
n17tb34ir6hawk2h	7w13qv5b5lj	6	\N	\N	\N
n17an0vjd9gwrc3c	7w13qv5b5lj	5	\N	\N	\N
ecductxt41c	7w13qv5b5lj	4	\N	\N	\N
wnv9hj3i2cg	7w13qv5b5lj	3	\N	\N	\N
ie0pp6rvvhe	7w13qv5b5lj	2	\N	\N	\N
7w13qv5b5lj	7w13qv5b5lj	0	f	grid	\N
wqlv319eqdf	7w13qv5b5lj	1	\N	\N	1
n17tfyodvrkcq0d	n17ikhplbvkckw9	9	\N	\N	\N
n17gksef074rhx	n17ikhplbvkckw9	8	\N	\N	\N
n17tb34ir6hawk2h	n17ikhplbvkckw9	7	\N	\N	\N
n17an0vjd9gwrc3c	n17ikhplbvkckw9	6	\N	\N	\N
ecductxt41c	n17ikhplbvkckw9	5	\N	\N	\N
wnv9hj3i2cg	n17ikhplbvkckw9	4	\N	\N	\N
ie0pp6rvvhe	n17ikhplbvkckw9	3	\N	\N	\N
wqlv319eqdf	n17ikhplbvkckw9	2	\N	\N	\N
n17ikhplbvkckw9	n17ikhplbvkckw9	0	f	items	\N
7w13qv5b5lj	n17ikhplbvkckw9	1	\N	\N	1
n17tfyodvrkcq0d	9ql5y7e1f6x	10	\N	\N	\N
n17gksef074rhx	9ql5y7e1f6x	9	\N	\N	\N
n17tb34ir6hawk2h	9ql5y7e1f6x	8	\N	\N	\N
n17an0vjd9gwrc3c	9ql5y7e1f6x	7	\N	\N	\N
ecductxt41c	9ql5y7e1f6x	6	\N	\N	\N
wnv9hj3i2cg	9ql5y7e1f6x	5	\N	\N	\N
ie0pp6rvvhe	9ql5y7e1f6x	4	\N	\N	\N
wqlv319eqdf	9ql5y7e1f6x	3	\N	\N	\N
7w13qv5b5lj	9ql5y7e1f6x	2	\N	\N	\N
9ql5y7e1f6x	9ql5y7e1f6x	0	f	field	\N
n17ikhplbvkckw9	9ql5y7e1f6x	1	\N	\N	1
n17tfyodvrkcq0d	n17i7jgrjachz6g	9	\N	\N	\N
n17gksef074rhx	n17i7jgrjachz6g	8	\N	\N	\N
n17tb34ir6hawk2h	n17i7jgrjachz6g	7	\N	\N	\N
n17an0vjd9gwrc3c	n17i7jgrjachz6g	6	\N	\N	\N
ecductxt41c	n17i7jgrjachz6g	5	\N	\N	\N
wnv9hj3i2cg	n17i7jgrjachz6g	4	\N	\N	\N
ie0pp6rvvhe	n17i7jgrjachz6g	3	\N	\N	\N
wqlv319eqdf	n17i7jgrjachz6g	2	\N	\N	\N
n17i7jgrjachz6g	n17i7jgrjachz6g	0	f	items	\N
7w13qv5b5lj	n17i7jgrjachz6g	1	\N	\N	2
n17tfyodvrkcq0d	zy418y99a9r	10	\N	\N	\N
n17gksef074rhx	zy418y99a9r	9	\N	\N	\N
n17tb34ir6hawk2h	zy418y99a9r	8	\N	\N	\N
n17an0vjd9gwrc3c	zy418y99a9r	7	\N	\N	\N
ecductxt41c	zy418y99a9r	6	\N	\N	\N
wnv9hj3i2cg	zy418y99a9r	5	\N	\N	\N
ie0pp6rvvhe	zy418y99a9r	4	\N	\N	\N
wqlv319eqdf	zy418y99a9r	3	\N	\N	\N
7w13qv5b5lj	zy418y99a9r	2	\N	\N	\N
zy418y99a9r	zy418y99a9r	0	f	field	\N
n17i7jgrjachz6g	zy418y99a9r	1	\N	\N	1
n17tfyodvrkcq0d	n17i374gtib87yv	9	\N	\N	\N
n17gksef074rhx	n17i374gtib87yv	8	\N	\N	\N
n17tb34ir6hawk2h	n17i374gtib87yv	7	\N	\N	\N
n17an0vjd9gwrc3c	n17i374gtib87yv	6	\N	\N	\N
ecductxt41c	n17i374gtib87yv	5	\N	\N	\N
wnv9hj3i2cg	n17i374gtib87yv	4	\N	\N	\N
ie0pp6rvvhe	n17i374gtib87yv	3	\N	\N	\N
08l3h3m1vxn	08l3h3m1vxn	0	f	\N	\N
wqlv319eqdf	n17i374gtib87yv	2	\N	\N	\N
n17i374gtib87yv	n17i374gtib87yv	0	f	items	\N
7w13qv5b5lj	n17i374gtib87yv	1	\N	\N	3
n17tfyodvrkcq0d	m77ldhli8in	10	\N	\N	\N
n17gksef074rhx	m77ldhli8in	9	\N	\N	\N
n17tb34ir6hawk2h	m77ldhli8in	8	\N	\N	\N
n17an0vjd9gwrc3c	m77ldhli8in	7	\N	\N	\N
ecductxt41c	m77ldhli8in	6	\N	\N	\N
wnv9hj3i2cg	m77ldhli8in	5	\N	\N	\N
ie0pp6rvvhe	m77ldhli8in	4	\N	\N	\N
wqlv319eqdf	m77ldhli8in	3	\N	\N	\N
7w13qv5b5lj	m77ldhli8in	2	\N	\N	\N
m77ldhli8in	m77ldhli8in	0	f	field	\N
n17i374gtib87yv	m77ldhli8in	1	\N	\N	1
n17tfyodvrkcq0d	n17ijka1snzwsw	9	\N	\N	\N
n17gksef074rhx	n17ijka1snzwsw	8	\N	\N	\N
n17tb34ir6hawk2h	n17ijka1snzwsw	7	\N	\N	\N
n17an0vjd9gwrc3c	n17ijka1snzwsw	6	\N	\N	\N
ecductxt41c	n17ijka1snzwsw	5	\N	\N	\N
wnv9hj3i2cg	n17ijka1snzwsw	4	\N	\N	\N
ie0pp6rvvhe	n17ijka1snzwsw	3	\N	\N	\N
wqlv319eqdf	n17ijka1snzwsw	2	\N	\N	\N
n17ijka1snzwsw	n17ijka1snzwsw	0	f	items	\N
7w13qv5b5lj	n17ijka1snzwsw	1	\N	\N	4
n17tfyodvrkcq0d	ugdudmtvu8w	10	\N	\N	\N
n17gksef074rhx	ugdudmtvu8w	9	\N	\N	\N
n17tb34ir6hawk2h	ugdudmtvu8w	8	\N	\N	\N
n17an0vjd9gwrc3c	ugdudmtvu8w	7	\N	\N	\N
ecductxt41c	ugdudmtvu8w	6	\N	\N	\N
wnv9hj3i2cg	ugdudmtvu8w	5	\N	\N	\N
ie0pp6rvvhe	ugdudmtvu8w	4	\N	\N	\N
wqlv319eqdf	ugdudmtvu8w	3	\N	\N	\N
7w13qv5b5lj	ugdudmtvu8w	2	\N	\N	\N
ugdudmtvu8w	ugdudmtvu8w	0	f	field	\N
n17ijka1snzwsw	ugdudmtvu8w	1	\N	\N	1
n17tfyodvrkcq0d	n17i5qwozgzw89a	9	\N	\N	\N
n17gksef074rhx	n17i5qwozgzw89a	8	\N	\N	\N
n17tb34ir6hawk2h	n17i5qwozgzw89a	7	\N	\N	\N
n17an0vjd9gwrc3c	n17i5qwozgzw89a	6	\N	\N	\N
ecductxt41c	n17i5qwozgzw89a	5	\N	\N	\N
wnv9hj3i2cg	n17i5qwozgzw89a	4	\N	\N	\N
ie0pp6rvvhe	n17i5qwozgzw89a	3	\N	\N	\N
wqlv319eqdf	n17i5qwozgzw89a	2	\N	\N	\N
n17i5qwozgzw89a	n17i5qwozgzw89a	0	f	items	\N
7w13qv5b5lj	n17i5qwozgzw89a	1	\N	\N	5
n17tfyodvrkcq0d	jm2wpw9rkpc	10	\N	\N	\N
n17gksef074rhx	jm2wpw9rkpc	9	\N	\N	\N
n17tb34ir6hawk2h	jm2wpw9rkpc	8	\N	\N	\N
n17an0vjd9gwrc3c	jm2wpw9rkpc	7	\N	\N	\N
ecductxt41c	jm2wpw9rkpc	6	\N	\N	\N
wnv9hj3i2cg	jm2wpw9rkpc	5	\N	\N	\N
ie0pp6rvvhe	jm2wpw9rkpc	4	\N	\N	\N
wqlv319eqdf	jm2wpw9rkpc	3	\N	\N	\N
7w13qv5b5lj	jm2wpw9rkpc	2	\N	\N	\N
jm2wpw9rkpc	jm2wpw9rkpc	0	f	field	\N
n17i5qwozgzw89a	jm2wpw9rkpc	1	\N	\N	1
n17tfyodvrkcq0d	n17rfcow28twku0u	3	\N	\N	\N
n17gksef074rhx	n17rfcow28twku0u	2	\N	\N	\N
n17rfcow28twku0u	n17rfcow28twku0u	0	f	actions	\N
n17tb34ir6hawk2h	n17rfcow28twku0u	1	\N	\N	2
n17c3lkyg9zjd6	n17c3lkyg9zjd6	0	f	\N	\N
n17t12fezb0kdm6	n17t12fezb0kdm6	0	f	\N	\N
n17pz2elarbkyyd	n17pz2elarbkyyd	0	f	page	\N
n17c3lkyg9zjd6	n17pz2elarbkyyd	1	\N	\N	1
n17gpu69sz1v3x	n17gpu69sz1v3x	0	f	grid	\N
n17t12fezb0kdm6	n17gpu69sz1v3x	1	\N	\N	1
n17t12fezb0kdm6	n17tbmigqv76d79	2	\N	\N	\N
n17tbmigqv76d79	n17tbmigqv76d79	0	f	items	\N
n17gpu69sz1v3x	n17tbmigqv76d79	1	\N	\N	1
n17t12fezb0kdm6	n17czzazkdl004	3	\N	\N	\N
n17gpu69sz1v3x	n17czzazkdl004	2	\N	\N	\N
n17czzazkdl004	n17czzazkdl004	0	f	columns	\N
n17tbmigqv76d79	n17czzazkdl004	1	\N	\N	1
n17t12fezb0kdm6	n17czzazkdl004f	4	\N	\N	\N
n17gpu69sz1v3x	n17czzazkdl004f	3	\N	\N	\N
n17tbmigqv76d79	n17czzazkdl004f	2	\N	\N	\N
n17czzazkdl004f	n17czzazkdl004f	0	f	field	\N
n17czzazkdl004	n17czzazkdl004f	1	\N	\N	1
n17t12fezb0kdm6	n17c8qxat7jzuzf	3	\N	\N	\N
n17gpu69sz1v3x	n17c8qxat7jzuzf	2	\N	\N	\N
n17c8qxat7jzuzf	n17c8qxat7jzuzf	0	f	columns	\N
n17tbmigqv76d79	n17c8qxat7jzuzf	1	\N	\N	2
n17t12fezb0kdm6	n17c8qxat7jzuzff	4	\N	\N	\N
n17gpu69sz1v3x	n17c8qxat7jzuzff	3	\N	\N	\N
n17tbmigqv76d79	n17c8qxat7jzuzff	2	\N	\N	\N
n17c8qxat7jzuzff	n17c8qxat7jzuzff	0	f	field	\N
n17c8qxat7jzuzf	n17c8qxat7jzuzff	1	\N	\N	1
n17t12fezb0kdm6	n17cgf4bsr5wxx5	3	\N	\N	\N
n17gpu69sz1v3x	n17cgf4bsr5wxx5	2	\N	\N	\N
n17cgf4bsr5wxx5	n17cgf4bsr5wxx5	0	f	columns	\N
n17tbmigqv76d79	n17cgf4bsr5wxx5	1	\N	\N	3
n17t12fezb0kdm6	n17cgf4bsr5wxx5f	4	\N	\N	\N
n17gpu69sz1v3x	n17cgf4bsr5wxx5f	3	\N	\N	\N
n17tbmigqv76d79	n17cgf4bsr5wxx5f	2	\N	\N	\N
n17cgf4bsr5wxx5f	n17cgf4bsr5wxx5f	0	f	field	\N
n17cgf4bsr5wxx5	n17cgf4bsr5wxx5f	1	\N	\N	1
n17t12fezb0kdm6	n17calpuywt301h	3	\N	\N	\N
n17gpu69sz1v3x	n17calpuywt301h	2	\N	\N	\N
n17calpuywt301h	n17calpuywt301h	0	f	columns	\N
n17tbmigqv76d79	n17calpuywt301h	1	\N	\N	4
n17t12fezb0kdm6	n17calpuywt301hf	4	\N	\N	\N
n17gpu69sz1v3x	n17calpuywt301hf	3	\N	\N	\N
n17tbmigqv76d79	n17calpuywt301hf	2	\N	\N	\N
n17calpuywt301hf	n17calpuywt301hf	0	f	field	\N
n17calpuywt301h	n17calpuywt301hf	1	\N	\N	1
n17t12fezb0kdm6	n17ca5rs5hqus56	3	\N	\N	\N
n17gpu69sz1v3x	n17ca5rs5hqus56	2	\N	\N	\N
n17ca5rs5hqus56	n17ca5rs5hqus56	0	f	columns	\N
n17tbmigqv76d79	n17ca5rs5hqus56	1	\N	\N	5
n17t12fezb0kdm6	n17ca5rs5hqus56f	4	\N	\N	\N
n17gpu69sz1v3x	n17ca5rs5hqus56f	3	\N	\N	\N
n17tbmigqv76d79	n17ca5rs5hqus56f	2	\N	\N	\N
n17ca5rs5hqus56f	n17ca5rs5hqus56f	0	f	field	\N
n17ca5rs5hqus56	n17ca5rs5hqus56f	1	\N	\N	1
n17t12fezb0kdm6	n17anojyqup3vyyq	3	\N	\N	\N
n17gpu69sz1v3x	n17anojyqup3vyyq	2	\N	\N	\N
n17anojyqup3vyyq	n17anojyqup3vyyq	0	f	actions	\N
n17tbmigqv76d79	n17anojyqup3vyyq	1	\N	\N	1
vqnu60n73n5	vqnu60n73n5	0	f	\N	\N
n17t12fezb0kdm6	27uizyaoeom	4	\N	\N	\N
n17gpu69sz1v3x	27uizyaoeom	3	\N	\N	\N
n17tbmigqv76d79	27uizyaoeom	2	\N	\N	\N
27uizyaoeom	27uizyaoeom	0	f	page	\N
n17anojyqup3vyyq	27uizyaoeom	1	\N	\N	1
n17t12fezb0kdm6	g6ajx0tunfr	5	\N	\N	\N
n17gpu69sz1v3x	g6ajx0tunfr	4	\N	\N	\N
n17tbmigqv76d79	g6ajx0tunfr	3	\N	\N	\N
n17anojyqup3vyyq	g6ajx0tunfr	2	\N	\N	\N
g6ajx0tunfr	g6ajx0tunfr	0	f	tabs	\N
27uizyaoeom	g6ajx0tunfr	1	\N	\N	1
n17t12fezb0kdm6	p4tfbl9ywsv	6	\N	\N	\N
n17gpu69sz1v3x	p4tfbl9ywsv	5	\N	\N	\N
n17tbmigqv76d79	p4tfbl9ywsv	4	\N	\N	\N
n17anojyqup3vyyq	p4tfbl9ywsv	3	\N	\N	\N
27uizyaoeom	p4tfbl9ywsv	2	\N	\N	\N
p4tfbl9ywsv	p4tfbl9ywsv	0	f	grid	\N
g6ajx0tunfr	p4tfbl9ywsv	1	\N	\N	1
n17t12fezb0kdm6	fg8vgdeq8o9	7	\N	\N	\N
n17gpu69sz1v3x	fg8vgdeq8o9	6	\N	\N	\N
n17tbmigqv76d79	fg8vgdeq8o9	5	\N	\N	\N
n17anojyqup3vyyq	fg8vgdeq8o9	4	\N	\N	\N
27uizyaoeom	fg8vgdeq8o9	3	\N	\N	\N
g6ajx0tunfr	fg8vgdeq8o9	2	\N	\N	\N
fg8vgdeq8o9	fg8vgdeq8o9	0	f	items	\N
p4tfbl9ywsv	fg8vgdeq8o9	1	\N	\N	1
n17t12fezb0kdm6	en6fa4qktml	8	\N	\N	\N
n17gpu69sz1v3x	en6fa4qktml	7	\N	\N	\N
n17tbmigqv76d79	en6fa4qktml	6	\N	\N	\N
n17anojyqup3vyyq	en6fa4qktml	5	\N	\N	\N
27uizyaoeom	en6fa4qktml	4	\N	\N	\N
g6ajx0tunfr	en6fa4qktml	3	\N	\N	\N
p4tfbl9ywsv	en6fa4qktml	2	\N	\N	\N
en6fa4qktml	en6fa4qktml	0	f	grid	\N
fg8vgdeq8o9	en6fa4qktml	1	\N	\N	1
n17t12fezb0kdm6	n17ipqhsy3s7xu	9	\N	\N	\N
n17gpu69sz1v3x	n17ipqhsy3s7xu	8	\N	\N	\N
n17tbmigqv76d79	n17ipqhsy3s7xu	7	\N	\N	\N
n17anojyqup3vyyq	n17ipqhsy3s7xu	6	\N	\N	\N
27uizyaoeom	n17ipqhsy3s7xu	5	\N	\N	\N
g6ajx0tunfr	n17ipqhsy3s7xu	4	\N	\N	\N
p4tfbl9ywsv	n17ipqhsy3s7xu	3	\N	\N	\N
fg8vgdeq8o9	n17ipqhsy3s7xu	2	\N	\N	\N
n17ipqhsy3s7xu	n17ipqhsy3s7xu	0	f	items	\N
en6fa4qktml	n17ipqhsy3s7xu	1	\N	\N	1
n17t12fezb0kdm6	xlbomh9fzec	10	\N	\N	\N
n17gpu69sz1v3x	xlbomh9fzec	9	\N	\N	\N
n17tbmigqv76d79	xlbomh9fzec	8	\N	\N	\N
n17anojyqup3vyyq	xlbomh9fzec	7	\N	\N	\N
27uizyaoeom	xlbomh9fzec	6	\N	\N	\N
g6ajx0tunfr	xlbomh9fzec	5	\N	\N	\N
p4tfbl9ywsv	xlbomh9fzec	4	\N	\N	\N
fg8vgdeq8o9	xlbomh9fzec	3	\N	\N	\N
en6fa4qktml	xlbomh9fzec	2	\N	\N	\N
xlbomh9fzec	xlbomh9fzec	0	f	field	\N
n17ipqhsy3s7xu	xlbomh9fzec	1	\N	\N	1
n17t12fezb0kdm6	n17is1om22hvhm	9	\N	\N	\N
n17gpu69sz1v3x	n17is1om22hvhm	8	\N	\N	\N
n17tbmigqv76d79	n17is1om22hvhm	7	\N	\N	\N
n17anojyqup3vyyq	n17is1om22hvhm	6	\N	\N	\N
27uizyaoeom	n17is1om22hvhm	5	\N	\N	\N
g6ajx0tunfr	n17is1om22hvhm	4	\N	\N	\N
p4tfbl9ywsv	n17is1om22hvhm	3	\N	\N	\N
fg8vgdeq8o9	n17is1om22hvhm	2	\N	\N	\N
n17is1om22hvhm	n17is1om22hvhm	0	f	items	\N
en6fa4qktml	n17is1om22hvhm	1	\N	\N	2
n17t12fezb0kdm6	amy4hny41p8	10	\N	\N	\N
n17gpu69sz1v3x	amy4hny41p8	9	\N	\N	\N
n17tbmigqv76d79	amy4hny41p8	8	\N	\N	\N
n17anojyqup3vyyq	amy4hny41p8	7	\N	\N	\N
27uizyaoeom	amy4hny41p8	6	\N	\N	\N
g6ajx0tunfr	amy4hny41p8	5	\N	\N	\N
p4tfbl9ywsv	amy4hny41p8	4	\N	\N	\N
fg8vgdeq8o9	amy4hny41p8	3	\N	\N	\N
en6fa4qktml	amy4hny41p8	2	\N	\N	\N
amy4hny41p8	amy4hny41p8	0	f	field	\N
n17is1om22hvhm	amy4hny41p8	1	\N	\N	1
n17t12fezb0kdm6	n17i3jqiec2gsxm	9	\N	\N	\N
n17gpu69sz1v3x	n17i3jqiec2gsxm	8	\N	\N	\N
n17tbmigqv76d79	n17i3jqiec2gsxm	7	\N	\N	\N
n17anojyqup3vyyq	n17i3jqiec2gsxm	6	\N	\N	\N
27uizyaoeom	n17i3jqiec2gsxm	5	\N	\N	\N
g6ajx0tunfr	n17i3jqiec2gsxm	4	\N	\N	\N
p4tfbl9ywsv	n17i3jqiec2gsxm	3	\N	\N	\N
fg8vgdeq8o9	n17i3jqiec2gsxm	2	\N	\N	\N
n17i3jqiec2gsxm	n17i3jqiec2gsxm	0	f	items	\N
en6fa4qktml	n17i3jqiec2gsxm	1	\N	\N	3
n17t12fezb0kdm6	zr5ah1ajgnu	10	\N	\N	\N
n17gpu69sz1v3x	zr5ah1ajgnu	9	\N	\N	\N
n17tbmigqv76d79	zr5ah1ajgnu	8	\N	\N	\N
n17anojyqup3vyyq	zr5ah1ajgnu	7	\N	\N	\N
27uizyaoeom	zr5ah1ajgnu	6	\N	\N	\N
g6ajx0tunfr	zr5ah1ajgnu	5	\N	\N	\N
p4tfbl9ywsv	zr5ah1ajgnu	4	\N	\N	\N
fg8vgdeq8o9	zr5ah1ajgnu	3	\N	\N	\N
en6fa4qktml	zr5ah1ajgnu	2	\N	\N	\N
zr5ah1ajgnu	zr5ah1ajgnu	0	f	field	\N
n17i3jqiec2gsxm	zr5ah1ajgnu	1	\N	\N	1
n17t12fezb0kdm6	n17i22klkfiqzyz	9	\N	\N	\N
n17gpu69sz1v3x	n17i22klkfiqzyz	8	\N	\N	\N
n17tbmigqv76d79	n17i22klkfiqzyz	7	\N	\N	\N
n17anojyqup3vyyq	n17i22klkfiqzyz	6	\N	\N	\N
27uizyaoeom	n17i22klkfiqzyz	5	\N	\N	\N
g6ajx0tunfr	n17i22klkfiqzyz	4	\N	\N	\N
p4tfbl9ywsv	n17i22klkfiqzyz	3	\N	\N	\N
fg8vgdeq8o9	n17i22klkfiqzyz	2	\N	\N	\N
n17i22klkfiqzyz	n17i22klkfiqzyz	0	f	items	\N
en6fa4qktml	n17i22klkfiqzyz	1	\N	\N	4
n17t12fezb0kdm6	rxd0mu1he78	10	\N	\N	\N
n17gpu69sz1v3x	rxd0mu1he78	9	\N	\N	\N
n17tbmigqv76d79	rxd0mu1he78	8	\N	\N	\N
n17anojyqup3vyyq	rxd0mu1he78	7	\N	\N	\N
27uizyaoeom	rxd0mu1he78	6	\N	\N	\N
g6ajx0tunfr	rxd0mu1he78	5	\N	\N	\N
p4tfbl9ywsv	rxd0mu1he78	4	\N	\N	\N
fg8vgdeq8o9	rxd0mu1he78	3	\N	\N	\N
en6fa4qktml	rxd0mu1he78	2	\N	\N	\N
rxd0mu1he78	rxd0mu1he78	0	f	field	\N
n17i22klkfiqzyz	rxd0mu1he78	1	\N	\N	1
n17t12fezb0kdm6	n17i04m3k8zyjbw	9	\N	\N	\N
n17gpu69sz1v3x	n17i04m3k8zyjbw	8	\N	\N	\N
n17tbmigqv76d79	n17i04m3k8zyjbw	7	\N	\N	\N
n17anojyqup3vyyq	n17i04m3k8zyjbw	6	\N	\N	\N
27uizyaoeom	n17i04m3k8zyjbw	5	\N	\N	\N
g6ajx0tunfr	n17i04m3k8zyjbw	4	\N	\N	\N
p4tfbl9ywsv	n17i04m3k8zyjbw	3	\N	\N	\N
fg8vgdeq8o9	n17i04m3k8zyjbw	2	\N	\N	\N
n17i04m3k8zyjbw	n17i04m3k8zyjbw	0	f	items	\N
en6fa4qktml	n17i04m3k8zyjbw	1	\N	\N	5
n17t12fezb0kdm6	axc6i7qm6ku	10	\N	\N	\N
n17gpu69sz1v3x	axc6i7qm6ku	9	\N	\N	\N
n17tbmigqv76d79	axc6i7qm6ku	8	\N	\N	\N
n17anojyqup3vyyq	axc6i7qm6ku	7	\N	\N	\N
27uizyaoeom	axc6i7qm6ku	6	\N	\N	\N
g6ajx0tunfr	axc6i7qm6ku	5	\N	\N	\N
p4tfbl9ywsv	axc6i7qm6ku	4	\N	\N	\N
fg8vgdeq8o9	axc6i7qm6ku	3	\N	\N	\N
en6fa4qktml	axc6i7qm6ku	2	\N	\N	\N
axc6i7qm6ku	axc6i7qm6ku	0	f	field	\N
n17i04m3k8zyjbw	axc6i7qm6ku	1	\N	\N	1
n17t12fezb0kdm6	n17rf8lptk9b02lt	3	\N	\N	\N
n17gpu69sz1v3x	n17rf8lptk9b02lt	2	\N	\N	\N
n17rf8lptk9b02lt	n17rf8lptk9b02lt	0	f	actions	\N
n17tbmigqv76d79	n17rf8lptk9b02lt	1	\N	\N	2
n17vu68623sj9i	n17vu68623sj9i	0	f	\N	\N
n17tfgec1j85e5d	n17tfgec1j85e5d	0	f	\N	\N
n17puy9spjgow2t	n17puy9spjgow2t	0	f	page	\N
n17vu68623sj9i	n17puy9spjgow2t	1	\N	\N	1
n17gzmr0v7w14r	n17gzmr0v7w14r	0	f	grid	\N
n17tfgec1j85e5d	n17gzmr0v7w14r	1	\N	\N	1
n17tfgec1j85e5d	n17tbe5sj8dsvieh	2	\N	\N	\N
n17tbe5sj8dsvieh	n17tbe5sj8dsvieh	0	f	items	\N
n17gzmr0v7w14r	n17tbe5sj8dsvieh	1	\N	\N	1
n17tfgec1j85e5d	n17c9ka40nvuo7	3	\N	\N	\N
n17gzmr0v7w14r	n17c9ka40nvuo7	2	\N	\N	\N
n17c9ka40nvuo7	n17c9ka40nvuo7	0	f	columns	\N
n17tbe5sj8dsvieh	n17c9ka40nvuo7	1	\N	\N	1
n17tfgec1j85e5d	n17c9ka40nvuo7f	4	\N	\N	\N
n17gzmr0v7w14r	n17c9ka40nvuo7f	3	\N	\N	\N
n17tbe5sj8dsvieh	n17c9ka40nvuo7f	2	\N	\N	\N
n17c9ka40nvuo7f	n17c9ka40nvuo7f	0	f	field	\N
n17c9ka40nvuo7	n17c9ka40nvuo7f	1	\N	\N	1
n17tfgec1j85e5d	n17c7l14ppxulb5	3	\N	\N	\N
n17gzmr0v7w14r	n17c7l14ppxulb5	2	\N	\N	\N
n17c7l14ppxulb5	n17c7l14ppxulb5	0	f	columns	\N
n17tbe5sj8dsvieh	n17c7l14ppxulb5	1	\N	\N	2
n17tfgec1j85e5d	n17c7l14ppxulb5f	4	\N	\N	\N
n17gzmr0v7w14r	n17c7l14ppxulb5f	3	\N	\N	\N
n17tbe5sj8dsvieh	n17c7l14ppxulb5f	2	\N	\N	\N
n17c7l14ppxulb5f	n17c7l14ppxulb5f	0	f	field	\N
n17c7l14ppxulb5	n17c7l14ppxulb5f	1	\N	\N	1
n17tfgec1j85e5d	n17cgdont7c8m6s	3	\N	\N	\N
n17gzmr0v7w14r	n17cgdont7c8m6s	2	\N	\N	\N
n17cgdont7c8m6s	n17cgdont7c8m6s	0	f	columns	\N
n17tbe5sj8dsvieh	n17cgdont7c8m6s	1	\N	\N	3
n17tfgec1j85e5d	n17cgdont7c8m6sf	4	\N	\N	\N
n17gzmr0v7w14r	n17cgdont7c8m6sf	3	\N	\N	\N
n17tbe5sj8dsvieh	n17cgdont7c8m6sf	2	\N	\N	\N
n17cgdont7c8m6sf	n17cgdont7c8m6sf	0	f	field	\N
n17cgdont7c8m6s	n17cgdont7c8m6sf	1	\N	\N	1
n17tfgec1j85e5d	n17cooj7zv8zzmd	3	\N	\N	\N
n17gzmr0v7w14r	n17cooj7zv8zzmd	2	\N	\N	\N
n17cooj7zv8zzmd	n17cooj7zv8zzmd	0	f	columns	\N
n17tbe5sj8dsvieh	n17cooj7zv8zzmd	1	\N	\N	4
n17tfgec1j85e5d	n17cooj7zv8zzmdf	4	\N	\N	\N
n17gzmr0v7w14r	n17cooj7zv8zzmdf	3	\N	\N	\N
n17tbe5sj8dsvieh	n17cooj7zv8zzmdf	2	\N	\N	\N
n17cooj7zv8zzmdf	n17cooj7zv8zzmdf	0	f	field	\N
n17cooj7zv8zzmd	n17cooj7zv8zzmdf	1	\N	\N	1
n17tfgec1j85e5d	n17cq8mdgf7mfd	3	\N	\N	\N
n17gzmr0v7w14r	n17cq8mdgf7mfd	2	\N	\N	\N
n17cq8mdgf7mfd	n17cq8mdgf7mfd	0	f	columns	\N
n17tbe5sj8dsvieh	n17cq8mdgf7mfd	1	\N	\N	5
n17tfgec1j85e5d	n17cq8mdgf7mfdf	4	\N	\N	\N
n17gzmr0v7w14r	n17cq8mdgf7mfdf	3	\N	\N	\N
n17tbe5sj8dsvieh	n17cq8mdgf7mfdf	2	\N	\N	\N
n17cq8mdgf7mfdf	n17cq8mdgf7mfdf	0	f	field	\N
n17cq8mdgf7mfd	n17cq8mdgf7mfdf	1	\N	\N	1
n17tfgec1j85e5d	n17angirk9efi9st	3	\N	\N	\N
n17gzmr0v7w14r	n17angirk9efi9st	2	\N	\N	\N
n17angirk9efi9st	n17angirk9efi9st	0	f	actions	\N
n17tbe5sj8dsvieh	n17angirk9efi9st	1	\N	\N	1
n17tfgec1j85e5d	ah559fbkpwr	4	\N	\N	\N
n17gzmr0v7w14r	ah559fbkpwr	3	\N	\N	\N
n17tbe5sj8dsvieh	ah559fbkpwr	2	\N	\N	\N
ah559fbkpwr	ah559fbkpwr	0	f	page	\N
n17angirk9efi9st	ah559fbkpwr	1	\N	\N	1
n17tfgec1j85e5d	0cwxawsd75b	5	\N	\N	\N
n17gzmr0v7w14r	0cwxawsd75b	4	\N	\N	\N
n17tbe5sj8dsvieh	0cwxawsd75b	3	\N	\N	\N
n17angirk9efi9st	0cwxawsd75b	2	\N	\N	\N
0cwxawsd75b	0cwxawsd75b	0	f	tabs	\N
ah559fbkpwr	0cwxawsd75b	1	\N	\N	1
n17tfgec1j85e5d	jgpe2vqzhh3	6	\N	\N	\N
n17gzmr0v7w14r	jgpe2vqzhh3	5	\N	\N	\N
n17tbe5sj8dsvieh	jgpe2vqzhh3	4	\N	\N	\N
n17angirk9efi9st	jgpe2vqzhh3	3	\N	\N	\N
ah559fbkpwr	jgpe2vqzhh3	2	\N	\N	\N
jgpe2vqzhh3	jgpe2vqzhh3	0	f	grid	\N
0cwxawsd75b	jgpe2vqzhh3	1	\N	\N	1
n17tfgec1j85e5d	96vmjc93frt	7	\N	\N	\N
n17gzmr0v7w14r	96vmjc93frt	6	\N	\N	\N
n17tbe5sj8dsvieh	96vmjc93frt	5	\N	\N	\N
n17angirk9efi9st	96vmjc93frt	4	\N	\N	\N
ah559fbkpwr	96vmjc93frt	3	\N	\N	\N
0cwxawsd75b	96vmjc93frt	2	\N	\N	\N
96vmjc93frt	96vmjc93frt	0	f	items	\N
jgpe2vqzhh3	96vmjc93frt	1	\N	\N	1
n17tfgec1j85e5d	og3b30jbrl0	8	\N	\N	\N
n17gzmr0v7w14r	og3b30jbrl0	7	\N	\N	\N
n17tbe5sj8dsvieh	og3b30jbrl0	6	\N	\N	\N
n17angirk9efi9st	og3b30jbrl0	5	\N	\N	\N
ah559fbkpwr	og3b30jbrl0	4	\N	\N	\N
0cwxawsd75b	og3b30jbrl0	3	\N	\N	\N
jgpe2vqzhh3	og3b30jbrl0	2	\N	\N	\N
og3b30jbrl0	og3b30jbrl0	0	f	grid	\N
96vmjc93frt	og3b30jbrl0	1	\N	\N	1
n17tfgec1j85e5d	n17i85jx35ct5hj	9	\N	\N	\N
n17gzmr0v7w14r	n17i85jx35ct5hj	8	\N	\N	\N
n17tbe5sj8dsvieh	n17i85jx35ct5hj	7	\N	\N	\N
n17angirk9efi9st	n17i85jx35ct5hj	6	\N	\N	\N
ah559fbkpwr	n17i85jx35ct5hj	5	\N	\N	\N
0cwxawsd75b	n17i85jx35ct5hj	4	\N	\N	\N
jgpe2vqzhh3	n17i85jx35ct5hj	3	\N	\N	\N
96vmjc93frt	n17i85jx35ct5hj	2	\N	\N	\N
n17i85jx35ct5hj	n17i85jx35ct5hj	0	f	items	\N
og3b30jbrl0	n17i85jx35ct5hj	1	\N	\N	1
n17tfgec1j85e5d	ebf5ligo2lu	10	\N	\N	\N
n17gzmr0v7w14r	ebf5ligo2lu	9	\N	\N	\N
n17tbe5sj8dsvieh	ebf5ligo2lu	8	\N	\N	\N
n17angirk9efi9st	ebf5ligo2lu	7	\N	\N	\N
ah559fbkpwr	ebf5ligo2lu	6	\N	\N	\N
0cwxawsd75b	ebf5ligo2lu	5	\N	\N	\N
jgpe2vqzhh3	ebf5ligo2lu	4	\N	\N	\N
96vmjc93frt	ebf5ligo2lu	3	\N	\N	\N
og3b30jbrl0	ebf5ligo2lu	2	\N	\N	\N
ebf5ligo2lu	ebf5ligo2lu	0	f	field	\N
n17i85jx35ct5hj	ebf5ligo2lu	1	\N	\N	1
n17tfgec1j85e5d	n17i0pgh9pn9sdr	9	\N	\N	\N
n17gzmr0v7w14r	n17i0pgh9pn9sdr	8	\N	\N	\N
n17tbe5sj8dsvieh	n17i0pgh9pn9sdr	7	\N	\N	\N
n17angirk9efi9st	n17i0pgh9pn9sdr	6	\N	\N	\N
ah559fbkpwr	n17i0pgh9pn9sdr	5	\N	\N	\N
0cwxawsd75b	n17i0pgh9pn9sdr	4	\N	\N	\N
jgpe2vqzhh3	n17i0pgh9pn9sdr	3	\N	\N	\N
96vmjc93frt	n17i0pgh9pn9sdr	2	\N	\N	\N
n17i0pgh9pn9sdr	n17i0pgh9pn9sdr	0	f	items	\N
og3b30jbrl0	n17i0pgh9pn9sdr	1	\N	\N	2
n17tfgec1j85e5d	rc4qi8o11zt	10	\N	\N	\N
n17gzmr0v7w14r	rc4qi8o11zt	9	\N	\N	\N
n17tbe5sj8dsvieh	rc4qi8o11zt	8	\N	\N	\N
n17angirk9efi9st	rc4qi8o11zt	7	\N	\N	\N
ah559fbkpwr	rc4qi8o11zt	6	\N	\N	\N
0cwxawsd75b	rc4qi8o11zt	5	\N	\N	\N
jgpe2vqzhh3	rc4qi8o11zt	4	\N	\N	\N
96vmjc93frt	rc4qi8o11zt	3	\N	\N	\N
og3b30jbrl0	rc4qi8o11zt	2	\N	\N	\N
rc4qi8o11zt	rc4qi8o11zt	0	f	field	\N
n17i0pgh9pn9sdr	rc4qi8o11zt	1	\N	\N	1
n17tfgec1j85e5d	n17ip21juq9fkjh	9	\N	\N	\N
n17gzmr0v7w14r	n17ip21juq9fkjh	8	\N	\N	\N
n17tbe5sj8dsvieh	n17ip21juq9fkjh	7	\N	\N	\N
n17angirk9efi9st	n17ip21juq9fkjh	6	\N	\N	\N
ah559fbkpwr	n17ip21juq9fkjh	5	\N	\N	\N
0cwxawsd75b	n17ip21juq9fkjh	4	\N	\N	\N
jgpe2vqzhh3	n17ip21juq9fkjh	3	\N	\N	\N
96vmjc93frt	n17ip21juq9fkjh	2	\N	\N	\N
n17ip21juq9fkjh	n17ip21juq9fkjh	0	f	items	\N
og3b30jbrl0	n17ip21juq9fkjh	1	\N	\N	3
n17tfgec1j85e5d	vyp02usbjl6	10	\N	\N	\N
n17gzmr0v7w14r	vyp02usbjl6	9	\N	\N	\N
n17tbe5sj8dsvieh	vyp02usbjl6	8	\N	\N	\N
n17angirk9efi9st	vyp02usbjl6	7	\N	\N	\N
ah559fbkpwr	vyp02usbjl6	6	\N	\N	\N
0cwxawsd75b	vyp02usbjl6	5	\N	\N	\N
jgpe2vqzhh3	vyp02usbjl6	4	\N	\N	\N
96vmjc93frt	vyp02usbjl6	3	\N	\N	\N
og3b30jbrl0	vyp02usbjl6	2	\N	\N	\N
vyp02usbjl6	vyp02usbjl6	0	f	field	\N
n17ip21juq9fkjh	vyp02usbjl6	1	\N	\N	1
n17tfgec1j85e5d	n17icju58zqbj6b	9	\N	\N	\N
n17gzmr0v7w14r	n17icju58zqbj6b	8	\N	\N	\N
n17tbe5sj8dsvieh	n17icju58zqbj6b	7	\N	\N	\N
n17angirk9efi9st	n17icju58zqbj6b	6	\N	\N	\N
ah559fbkpwr	n17icju58zqbj6b	5	\N	\N	\N
0cwxawsd75b	n17icju58zqbj6b	4	\N	\N	\N
jgpe2vqzhh3	n17icju58zqbj6b	3	\N	\N	\N
96vmjc93frt	n17icju58zqbj6b	2	\N	\N	\N
n17icju58zqbj6b	n17icju58zqbj6b	0	f	items	\N
og3b30jbrl0	n17icju58zqbj6b	1	\N	\N	4
n17tfgec1j85e5d	o71eceys0ib	10	\N	\N	\N
n17gzmr0v7w14r	o71eceys0ib	9	\N	\N	\N
n17tbe5sj8dsvieh	o71eceys0ib	8	\N	\N	\N
n17angirk9efi9st	o71eceys0ib	7	\N	\N	\N
ah559fbkpwr	o71eceys0ib	6	\N	\N	\N
0cwxawsd75b	o71eceys0ib	5	\N	\N	\N
jgpe2vqzhh3	o71eceys0ib	4	\N	\N	\N
96vmjc93frt	o71eceys0ib	3	\N	\N	\N
og3b30jbrl0	o71eceys0ib	2	\N	\N	\N
o71eceys0ib	o71eceys0ib	0	f	field	\N
n17icju58zqbj6b	o71eceys0ib	1	\N	\N	1
n17tfgec1j85e5d	n17rfveae7rthhfg	3	\N	\N	\N
n17gzmr0v7w14r	n17rfveae7rthhfg	2	\N	\N	\N
n17rfveae7rthhfg	n17rfveae7rthhfg	0	f	actions	\N
n17tbe5sj8dsvieh	n17rfveae7rthhfg	1	\N	\N	2
n17v6xfvzxoj0f	n17v6xfvzxoj0f	0	f	\N	\N
n17tkf0ipg15b6	n17tkf0ipg15b6	0	f	\N	\N
n17pj5ccw34hcm8	n17pj5ccw34hcm8	0	f	page	\N
n17v6xfvzxoj0f	n17pj5ccw34hcm8	1	\N	\N	1
n17gnxg1hj63t2	n17gnxg1hj63t2	0	f	grid	\N
n17tkf0ipg15b6	n17gnxg1hj63t2	1	\N	\N	1
n17tkf0ipg15b6	n17tbgrzqc88xbuu	2	\N	\N	\N
n17tbgrzqc88xbuu	n17tbgrzqc88xbuu	0	f	items	\N
n17gnxg1hj63t2	n17tbgrzqc88xbuu	1	\N	\N	1
n17tkf0ipg15b6	n17cbn0m01ldr5w	3	\N	\N	\N
n17gnxg1hj63t2	n17cbn0m01ldr5w	2	\N	\N	\N
n17cbn0m01ldr5w	n17cbn0m01ldr5w	0	f	columns	\N
n17tbgrzqc88xbuu	n17cbn0m01ldr5w	1	\N	\N	1
n17tkf0ipg15b6	n17cbn0m01ldr5wf	4	\N	\N	\N
n17gnxg1hj63t2	n17cbn0m01ldr5wf	3	\N	\N	\N
n17tbgrzqc88xbuu	n17cbn0m01ldr5wf	2	\N	\N	\N
n17cbn0m01ldr5wf	n17cbn0m01ldr5wf	0	f	field	\N
n17cbn0m01ldr5w	n17cbn0m01ldr5wf	1	\N	\N	1
n17tkf0ipg15b6	n17cwwn5l70knv	3	\N	\N	\N
n17gnxg1hj63t2	n17cwwn5l70knv	2	\N	\N	\N
n17cwwn5l70knv	n17cwwn5l70knv	0	f	columns	\N
n17tbgrzqc88xbuu	n17cwwn5l70knv	1	\N	\N	2
n17tkf0ipg15b6	n17cwwn5l70knvf	4	\N	\N	\N
n17gnxg1hj63t2	n17cwwn5l70knvf	3	\N	\N	\N
n17tbgrzqc88xbuu	n17cwwn5l70knvf	2	\N	\N	\N
n17cwwn5l70knvf	n17cwwn5l70knvf	0	f	field	\N
n17cwwn5l70knv	n17cwwn5l70knvf	1	\N	\N	1
n17tkf0ipg15b6	n17cxvrk0srw0d	3	\N	\N	\N
n17gnxg1hj63t2	n17cxvrk0srw0d	2	\N	\N	\N
n17cxvrk0srw0d	n17cxvrk0srw0d	0	f	columns	\N
n17tbgrzqc88xbuu	n17cxvrk0srw0d	1	\N	\N	3
n17tkf0ipg15b6	n17cxvrk0srw0df	4	\N	\N	\N
n17gnxg1hj63t2	n17cxvrk0srw0df	3	\N	\N	\N
n17tbgrzqc88xbuu	n17cxvrk0srw0df	2	\N	\N	\N
n17cxvrk0srw0df	n17cxvrk0srw0df	0	f	field	\N
n17cxvrk0srw0d	n17cxvrk0srw0df	1	\N	\N	1
n17tkf0ipg15b6	n17cneqrt5bcl	3	\N	\N	\N
n17gnxg1hj63t2	n17cneqrt5bcl	2	\N	\N	\N
n17cneqrt5bcl	n17cneqrt5bcl	0	f	columns	\N
n17tbgrzqc88xbuu	n17cneqrt5bcl	1	\N	\N	4
n17tkf0ipg15b6	n17cneqrt5bclf	4	\N	\N	\N
n17gnxg1hj63t2	n17cneqrt5bclf	3	\N	\N	\N
n17tbgrzqc88xbuu	n17cneqrt5bclf	2	\N	\N	\N
n17cneqrt5bclf	n17cneqrt5bclf	0	f	field	\N
n17cneqrt5bcl	n17cneqrt5bclf	1	\N	\N	1
n17tkf0ipg15b6	n17anpa81ofl9ky	3	\N	\N	\N
n17gnxg1hj63t2	n17anpa81ofl9ky	2	\N	\N	\N
n17anpa81ofl9ky	n17anpa81ofl9ky	0	f	actions	\N
n17tbgrzqc88xbuu	n17anpa81ofl9ky	1	\N	\N	1
n17tkf0ipg15b6	ii09dv79a3x	4	\N	\N	\N
n17gnxg1hj63t2	ii09dv79a3x	3	\N	\N	\N
n17tbgrzqc88xbuu	ii09dv79a3x	2	\N	\N	\N
ii09dv79a3x	ii09dv79a3x	0	f	page	\N
n17anpa81ofl9ky	ii09dv79a3x	1	\N	\N	1
n17tkf0ipg15b6	u2p6hsshmzu	5	\N	\N	\N
n17gnxg1hj63t2	u2p6hsshmzu	4	\N	\N	\N
n17tbgrzqc88xbuu	u2p6hsshmzu	3	\N	\N	\N
n17anpa81ofl9ky	u2p6hsshmzu	2	\N	\N	\N
u2p6hsshmzu	u2p6hsshmzu	0	f	tabs	\N
ii09dv79a3x	u2p6hsshmzu	1	\N	\N	1
n17tkf0ipg15b6	1zx5qopep7e	6	\N	\N	\N
n17gnxg1hj63t2	1zx5qopep7e	5	\N	\N	\N
n17tbgrzqc88xbuu	1zx5qopep7e	4	\N	\N	\N
n17anpa81ofl9ky	1zx5qopep7e	3	\N	\N	\N
ii09dv79a3x	1zx5qopep7e	2	\N	\N	\N
1zx5qopep7e	1zx5qopep7e	0	f	grid	\N
u2p6hsshmzu	1zx5qopep7e	1	\N	\N	1
n17tkf0ipg15b6	sy34mnly8c6	7	\N	\N	\N
n17gnxg1hj63t2	sy34mnly8c6	6	\N	\N	\N
n17tbgrzqc88xbuu	sy34mnly8c6	5	\N	\N	\N
n17anpa81ofl9ky	sy34mnly8c6	4	\N	\N	\N
ii09dv79a3x	sy34mnly8c6	3	\N	\N	\N
u2p6hsshmzu	sy34mnly8c6	2	\N	\N	\N
sy34mnly8c6	sy34mnly8c6	0	f	items	\N
1zx5qopep7e	sy34mnly8c6	1	\N	\N	1
n17tkf0ipg15b6	y80aro3on81	8	\N	\N	\N
n17gnxg1hj63t2	y80aro3on81	7	\N	\N	\N
n17tbgrzqc88xbuu	y80aro3on81	6	\N	\N	\N
n17anpa81ofl9ky	y80aro3on81	5	\N	\N	\N
ii09dv79a3x	y80aro3on81	4	\N	\N	\N
u2p6hsshmzu	y80aro3on81	3	\N	\N	\N
1zx5qopep7e	y80aro3on81	2	\N	\N	\N
y80aro3on81	y80aro3on81	0	f	grid	\N
sy34mnly8c6	y80aro3on81	1	\N	\N	1
n17tkf0ipg15b6	n17i59je3bfay0h	9	\N	\N	\N
n17gnxg1hj63t2	n17i59je3bfay0h	8	\N	\N	\N
n17tbgrzqc88xbuu	n17i59je3bfay0h	7	\N	\N	\N
n17anpa81ofl9ky	n17i59je3bfay0h	6	\N	\N	\N
ii09dv79a3x	n17i59je3bfay0h	5	\N	\N	\N
u2p6hsshmzu	n17i59je3bfay0h	4	\N	\N	\N
1zx5qopep7e	n17i59je3bfay0h	3	\N	\N	\N
sy34mnly8c6	n17i59je3bfay0h	2	\N	\N	\N
n17i59je3bfay0h	n17i59je3bfay0h	0	f	items	\N
y80aro3on81	n17i59je3bfay0h	1	\N	\N	1
n17tkf0ipg15b6	ey8ac5j0t0b	10	\N	\N	\N
n17gnxg1hj63t2	ey8ac5j0t0b	9	\N	\N	\N
n17tbgrzqc88xbuu	ey8ac5j0t0b	8	\N	\N	\N
n17anpa81ofl9ky	ey8ac5j0t0b	7	\N	\N	\N
ii09dv79a3x	ey8ac5j0t0b	6	\N	\N	\N
u2p6hsshmzu	ey8ac5j0t0b	5	\N	\N	\N
1zx5qopep7e	ey8ac5j0t0b	4	\N	\N	\N
sy34mnly8c6	ey8ac5j0t0b	3	\N	\N	\N
y80aro3on81	ey8ac5j0t0b	2	\N	\N	\N
ey8ac5j0t0b	ey8ac5j0t0b	0	f	field	\N
n17i59je3bfay0h	ey8ac5j0t0b	1	\N	\N	1
n17tkf0ipg15b6	n17izjg2hhql6oj	9	\N	\N	\N
n17gnxg1hj63t2	n17izjg2hhql6oj	8	\N	\N	\N
n17tbgrzqc88xbuu	n17izjg2hhql6oj	7	\N	\N	\N
n17anpa81ofl9ky	n17izjg2hhql6oj	6	\N	\N	\N
ii09dv79a3x	n17izjg2hhql6oj	5	\N	\N	\N
u2p6hsshmzu	n17izjg2hhql6oj	4	\N	\N	\N
1zx5qopep7e	n17izjg2hhql6oj	3	\N	\N	\N
sy34mnly8c6	n17izjg2hhql6oj	2	\N	\N	\N
n17izjg2hhql6oj	n17izjg2hhql6oj	0	f	items	\N
y80aro3on81	n17izjg2hhql6oj	1	\N	\N	2
n17tkf0ipg15b6	v5vw360ezm3	10	\N	\N	\N
n17gnxg1hj63t2	v5vw360ezm3	9	\N	\N	\N
n17tbgrzqc88xbuu	v5vw360ezm3	8	\N	\N	\N
n17anpa81ofl9ky	v5vw360ezm3	7	\N	\N	\N
ii09dv79a3x	v5vw360ezm3	6	\N	\N	\N
u2p6hsshmzu	v5vw360ezm3	5	\N	\N	\N
1zx5qopep7e	v5vw360ezm3	4	\N	\N	\N
sy34mnly8c6	v5vw360ezm3	3	\N	\N	\N
y80aro3on81	v5vw360ezm3	2	\N	\N	\N
v5vw360ezm3	v5vw360ezm3	0	f	field	\N
n17izjg2hhql6oj	v5vw360ezm3	1	\N	\N	1
n17tkf0ipg15b6	n17iowayu385jjs	9	\N	\N	\N
n17gnxg1hj63t2	n17iowayu385jjs	8	\N	\N	\N
n17tbgrzqc88xbuu	n17iowayu385jjs	7	\N	\N	\N
n17anpa81ofl9ky	n17iowayu385jjs	6	\N	\N	\N
ii09dv79a3x	n17iowayu385jjs	5	\N	\N	\N
u2p6hsshmzu	n17iowayu385jjs	4	\N	\N	\N
1zx5qopep7e	n17iowayu385jjs	3	\N	\N	\N
sy34mnly8c6	n17iowayu385jjs	2	\N	\N	\N
n17iowayu385jjs	n17iowayu385jjs	0	f	items	\N
y80aro3on81	n17iowayu385jjs	1	\N	\N	3
n17tkf0ipg15b6	cm8c1ywagst	10	\N	\N	\N
n17gnxg1hj63t2	cm8c1ywagst	9	\N	\N	\N
n17tbgrzqc88xbuu	cm8c1ywagst	8	\N	\N	\N
n17anpa81ofl9ky	cm8c1ywagst	7	\N	\N	\N
ii09dv79a3x	cm8c1ywagst	6	\N	\N	\N
u2p6hsshmzu	cm8c1ywagst	5	\N	\N	\N
1zx5qopep7e	cm8c1ywagst	4	\N	\N	\N
sy34mnly8c6	cm8c1ywagst	3	\N	\N	\N
y80aro3on81	cm8c1ywagst	2	\N	\N	\N
cm8c1ywagst	cm8c1ywagst	0	f	field	\N
n17iowayu385jjs	cm8c1ywagst	1	\N	\N	1
n17tkf0ipg15b6	n17rfrt1gr7nmeqd	3	\N	\N	\N
n17gnxg1hj63t2	n17rfrt1gr7nmeqd	2	\N	\N	\N
n17rfrt1gr7nmeqd	n17rfrt1gr7nmeqd	0	f	actions	\N
n17tbgrzqc88xbuu	n17rfrt1gr7nmeqd	1	\N	\N	2
n17etqhllqqa28	n17etqhllqqa28	0	f	\N	\N
n17tgpj7uku1rcb	n17tgpj7uku1rcb	0	f	\N	\N
n17psm1qx85l6c	n17psm1qx85l6c	0	f	page	\N
n17etqhllqqa28	n17psm1qx85l6c	1	\N	\N	1
n17gqxvb782dhm	n17gqxvb782dhm	0	f	grid	\N
n17tgpj7uku1rcb	n17gqxvb782dhm	1	\N	\N	1
n17tgpj7uku1rcb	n17tbcdlj6fd8nd	2	\N	\N	\N
n17tbcdlj6fd8nd	n17tbcdlj6fd8nd	0	f	items	\N
n17gqxvb782dhm	n17tbcdlj6fd8nd	1	\N	\N	1
n17tgpj7uku1rcb	n17c4mddjna8g7s	3	\N	\N	\N
n17gqxvb782dhm	n17c4mddjna8g7s	2	\N	\N	\N
n17c4mddjna8g7s	n17c4mddjna8g7s	0	f	columns	\N
n17tbcdlj6fd8nd	n17c4mddjna8g7s	1	\N	\N	1
n17tgpj7uku1rcb	n17c4mddjna8g7sf	4	\N	\N	\N
n17gqxvb782dhm	n17c4mddjna8g7sf	3	\N	\N	\N
n17tbcdlj6fd8nd	n17c4mddjna8g7sf	2	\N	\N	\N
n17c4mddjna8g7sf	n17c4mddjna8g7sf	0	f	field	\N
n17c4mddjna8g7s	n17c4mddjna8g7sf	1	\N	\N	1
n17tgpj7uku1rcb	n17cgi0y45zx2tf	3	\N	\N	\N
n17gqxvb782dhm	n17cgi0y45zx2tf	2	\N	\N	\N
n17cgi0y45zx2tf	n17cgi0y45zx2tf	0	f	columns	\N
n17tbcdlj6fd8nd	n17cgi0y45zx2tf	1	\N	\N	2
n17tgpj7uku1rcb	n17cgi0y45zx2tff	4	\N	\N	\N
n17gqxvb782dhm	n17cgi0y45zx2tff	3	\N	\N	\N
n17tbcdlj6fd8nd	n17cgi0y45zx2tff	2	\N	\N	\N
n17cgi0y45zx2tff	n17cgi0y45zx2tff	0	f	field	\N
n17cgi0y45zx2tf	n17cgi0y45zx2tff	1	\N	\N	1
n17tgpj7uku1rcb	n17cp1r83qbid7g	3	\N	\N	\N
n17gqxvb782dhm	n17cp1r83qbid7g	2	\N	\N	\N
n17cp1r83qbid7g	n17cp1r83qbid7g	0	f	columns	\N
n17tbcdlj6fd8nd	n17cp1r83qbid7g	1	\N	\N	3
n17tgpj7uku1rcb	n17cp1r83qbid7gf	4	\N	\N	\N
n17gqxvb782dhm	n17cp1r83qbid7gf	3	\N	\N	\N
n17tbcdlj6fd8nd	n17cp1r83qbid7gf	2	\N	\N	\N
n17cp1r83qbid7gf	n17cp1r83qbid7gf	0	f	field	\N
n17cp1r83qbid7g	n17cp1r83qbid7gf	1	\N	\N	1
n17tgpj7uku1rcb	n17c9or5abfvfv	3	\N	\N	\N
n17gqxvb782dhm	n17c9or5abfvfv	2	\N	\N	\N
n17c9or5abfvfv	n17c9or5abfvfv	0	f	columns	\N
n17tbcdlj6fd8nd	n17c9or5abfvfv	1	\N	\N	4
n17tgpj7uku1rcb	n17c9or5abfvfvf	4	\N	\N	\N
n17gqxvb782dhm	n17c9or5abfvfvf	3	\N	\N	\N
n17tbcdlj6fd8nd	n17c9or5abfvfvf	2	\N	\N	\N
n17c9or5abfvfvf	n17c9or5abfvfvf	0	f	field	\N
n17c9or5abfvfv	n17c9or5abfvfvf	1	\N	\N	1
n17tgpj7uku1rcb	n17c2tv9oj5w3t	3	\N	\N	\N
n17gqxvb782dhm	n17c2tv9oj5w3t	2	\N	\N	\N
n17c2tv9oj5w3t	n17c2tv9oj5w3t	0	f	columns	\N
n17tbcdlj6fd8nd	n17c2tv9oj5w3t	1	\N	\N	5
n17tgpj7uku1rcb	n17c2tv9oj5w3tf	4	\N	\N	\N
n17gqxvb782dhm	n17c2tv9oj5w3tf	3	\N	\N	\N
n17tbcdlj6fd8nd	n17c2tv9oj5w3tf	2	\N	\N	\N
n17c2tv9oj5w3tf	n17c2tv9oj5w3tf	0	f	field	\N
n17c2tv9oj5w3t	n17c2tv9oj5w3tf	1	\N	\N	1
n17tgpj7uku1rcb	n17ctxqc1xyt2x	3	\N	\N	\N
n17gqxvb782dhm	n17ctxqc1xyt2x	2	\N	\N	\N
n17ctxqc1xyt2x	n17ctxqc1xyt2x	0	f	columns	\N
n17tbcdlj6fd8nd	n17ctxqc1xyt2x	1	\N	\N	6
n17tgpj7uku1rcb	n17ctxqc1xyt2xf	4	\N	\N	\N
n17gqxvb782dhm	n17ctxqc1xyt2xf	3	\N	\N	\N
n17tbcdlj6fd8nd	n17ctxqc1xyt2xf	2	\N	\N	\N
n17ctxqc1xyt2xf	n17ctxqc1xyt2xf	0	f	field	\N
n17ctxqc1xyt2x	n17ctxqc1xyt2xf	1	\N	\N	1
n17tgpj7uku1rcb	n17anciuiqjj5z	3	\N	\N	\N
n17gqxvb782dhm	n17anciuiqjj5z	2	\N	\N	\N
n17anciuiqjj5z	n17anciuiqjj5z	0	f	actions	\N
n17tbcdlj6fd8nd	n17anciuiqjj5z	1	\N	\N	1
n17tgpj7uku1rcb	kbat1zt768b	4	\N	\N	\N
n17gqxvb782dhm	kbat1zt768b	3	\N	\N	\N
n17tbcdlj6fd8nd	kbat1zt768b	2	\N	\N	\N
kbat1zt768b	kbat1zt768b	0	f	page	\N
n17anciuiqjj5z	kbat1zt768b	1	\N	\N	1
n17tgpj7uku1rcb	otq0qlkbq1e	5	\N	\N	\N
n17gqxvb782dhm	otq0qlkbq1e	4	\N	\N	\N
n17tbcdlj6fd8nd	otq0qlkbq1e	3	\N	\N	\N
n17anciuiqjj5z	otq0qlkbq1e	2	\N	\N	\N
otq0qlkbq1e	otq0qlkbq1e	0	f	tabs	\N
kbat1zt768b	otq0qlkbq1e	1	\N	\N	1
n17tgpj7uku1rcb	j2xilg2fkfc	6	\N	\N	\N
n17gqxvb782dhm	j2xilg2fkfc	5	\N	\N	\N
n17tbcdlj6fd8nd	j2xilg2fkfc	4	\N	\N	\N
n17anciuiqjj5z	j2xilg2fkfc	3	\N	\N	\N
kbat1zt768b	j2xilg2fkfc	2	\N	\N	\N
j2xilg2fkfc	j2xilg2fkfc	0	f	grid	\N
otq0qlkbq1e	j2xilg2fkfc	1	\N	\N	1
n17tgpj7uku1rcb	cyezqctu98x	7	\N	\N	\N
n17gqxvb782dhm	cyezqctu98x	6	\N	\N	\N
n17tbcdlj6fd8nd	cyezqctu98x	5	\N	\N	\N
n17anciuiqjj5z	cyezqctu98x	4	\N	\N	\N
kbat1zt768b	cyezqctu98x	3	\N	\N	\N
otq0qlkbq1e	cyezqctu98x	2	\N	\N	\N
cyezqctu98x	cyezqctu98x	0	f	items	\N
j2xilg2fkfc	cyezqctu98x	1	\N	\N	1
n17tgpj7uku1rcb	wx7qxj8vvq6	8	\N	\N	\N
n17gqxvb782dhm	wx7qxj8vvq6	7	\N	\N	\N
n17tbcdlj6fd8nd	wx7qxj8vvq6	6	\N	\N	\N
n17anciuiqjj5z	wx7qxj8vvq6	5	\N	\N	\N
kbat1zt768b	wx7qxj8vvq6	4	\N	\N	\N
otq0qlkbq1e	wx7qxj8vvq6	3	\N	\N	\N
j2xilg2fkfc	wx7qxj8vvq6	2	\N	\N	\N
wx7qxj8vvq6	wx7qxj8vvq6	0	f	grid	\N
cyezqctu98x	wx7qxj8vvq6	1	\N	\N	1
n17tgpj7uku1rcb	n17iabx2zxkxb68	9	\N	\N	\N
n17gqxvb782dhm	n17iabx2zxkxb68	8	\N	\N	\N
n17tbcdlj6fd8nd	n17iabx2zxkxb68	7	\N	\N	\N
n17anciuiqjj5z	n17iabx2zxkxb68	6	\N	\N	\N
kbat1zt768b	n17iabx2zxkxb68	5	\N	\N	\N
otq0qlkbq1e	n17iabx2zxkxb68	4	\N	\N	\N
j2xilg2fkfc	n17iabx2zxkxb68	3	\N	\N	\N
cyezqctu98x	n17iabx2zxkxb68	2	\N	\N	\N
n17iabx2zxkxb68	n17iabx2zxkxb68	0	f	items	\N
wx7qxj8vvq6	n17iabx2zxkxb68	1	\N	\N	1
n17tgpj7uku1rcb	vdzirm9qhrl	10	\N	\N	\N
n17gqxvb782dhm	vdzirm9qhrl	9	\N	\N	\N
n17tbcdlj6fd8nd	vdzirm9qhrl	8	\N	\N	\N
n17anciuiqjj5z	vdzirm9qhrl	7	\N	\N	\N
kbat1zt768b	vdzirm9qhrl	6	\N	\N	\N
otq0qlkbq1e	vdzirm9qhrl	5	\N	\N	\N
j2xilg2fkfc	vdzirm9qhrl	4	\N	\N	\N
cyezqctu98x	vdzirm9qhrl	3	\N	\N	\N
wx7qxj8vvq6	vdzirm9qhrl	2	\N	\N	\N
vdzirm9qhrl	vdzirm9qhrl	0	f	field	\N
n17iabx2zxkxb68	vdzirm9qhrl	1	\N	\N	1
n17tgpj7uku1rcb	n17i7bsl8233z49	9	\N	\N	\N
n17gqxvb782dhm	n17i7bsl8233z49	8	\N	\N	\N
n17tbcdlj6fd8nd	n17i7bsl8233z49	7	\N	\N	\N
n17anciuiqjj5z	n17i7bsl8233z49	6	\N	\N	\N
kbat1zt768b	n17i7bsl8233z49	5	\N	\N	\N
otq0qlkbq1e	n17i7bsl8233z49	4	\N	\N	\N
j2xilg2fkfc	n17i7bsl8233z49	3	\N	\N	\N
cyezqctu98x	n17i7bsl8233z49	2	\N	\N	\N
n17i7bsl8233z49	n17i7bsl8233z49	0	f	items	\N
wx7qxj8vvq6	n17i7bsl8233z49	1	\N	\N	2
n17tgpj7uku1rcb	7p2ut7naxhy	10	\N	\N	\N
n17gqxvb782dhm	7p2ut7naxhy	9	\N	\N	\N
n17tbcdlj6fd8nd	7p2ut7naxhy	8	\N	\N	\N
n17anciuiqjj5z	7p2ut7naxhy	7	\N	\N	\N
kbat1zt768b	7p2ut7naxhy	6	\N	\N	\N
otq0qlkbq1e	7p2ut7naxhy	5	\N	\N	\N
j2xilg2fkfc	7p2ut7naxhy	4	\N	\N	\N
cyezqctu98x	7p2ut7naxhy	3	\N	\N	\N
wx7qxj8vvq6	7p2ut7naxhy	2	\N	\N	\N
7p2ut7naxhy	7p2ut7naxhy	0	f	field	\N
n17i7bsl8233z49	7p2ut7naxhy	1	\N	\N	1
n17tgpj7uku1rcb	n17i2tid9ghh976	9	\N	\N	\N
n17gqxvb782dhm	n17i2tid9ghh976	8	\N	\N	\N
n17tbcdlj6fd8nd	n17i2tid9ghh976	7	\N	\N	\N
n17anciuiqjj5z	n17i2tid9ghh976	6	\N	\N	\N
kbat1zt768b	n17i2tid9ghh976	5	\N	\N	\N
otq0qlkbq1e	n17i2tid9ghh976	4	\N	\N	\N
j2xilg2fkfc	n17i2tid9ghh976	3	\N	\N	\N
cyezqctu98x	n17i2tid9ghh976	2	\N	\N	\N
n17i2tid9ghh976	n17i2tid9ghh976	0	f	items	\N
wx7qxj8vvq6	n17i2tid9ghh976	1	\N	\N	3
n17tgpj7uku1rcb	uv5mklmerm3	10	\N	\N	\N
n17gqxvb782dhm	uv5mklmerm3	9	\N	\N	\N
n17tbcdlj6fd8nd	uv5mklmerm3	8	\N	\N	\N
n17anciuiqjj5z	uv5mklmerm3	7	\N	\N	\N
kbat1zt768b	uv5mklmerm3	6	\N	\N	\N
otq0qlkbq1e	uv5mklmerm3	5	\N	\N	\N
j2xilg2fkfc	uv5mklmerm3	4	\N	\N	\N
cyezqctu98x	uv5mklmerm3	3	\N	\N	\N
wx7qxj8vvq6	uv5mklmerm3	2	\N	\N	\N
uv5mklmerm3	uv5mklmerm3	0	f	field	\N
n17i2tid9ghh976	uv5mklmerm3	1	\N	\N	1
n17tgpj7uku1rcb	n17iu42tf4qfr1	9	\N	\N	\N
n17gqxvb782dhm	n17iu42tf4qfr1	8	\N	\N	\N
n17tbcdlj6fd8nd	n17iu42tf4qfr1	7	\N	\N	\N
n17anciuiqjj5z	n17iu42tf4qfr1	6	\N	\N	\N
kbat1zt768b	n17iu42tf4qfr1	5	\N	\N	\N
otq0qlkbq1e	n17iu42tf4qfr1	4	\N	\N	\N
j2xilg2fkfc	n17iu42tf4qfr1	3	\N	\N	\N
cyezqctu98x	n17iu42tf4qfr1	2	\N	\N	\N
n17iu42tf4qfr1	n17iu42tf4qfr1	0	f	items	\N
wx7qxj8vvq6	n17iu42tf4qfr1	1	\N	\N	4
n17tgpj7uku1rcb	ke2i1ila49c	10	\N	\N	\N
n17gqxvb782dhm	ke2i1ila49c	9	\N	\N	\N
n17tbcdlj6fd8nd	ke2i1ila49c	8	\N	\N	\N
n17anciuiqjj5z	ke2i1ila49c	7	\N	\N	\N
kbat1zt768b	ke2i1ila49c	6	\N	\N	\N
otq0qlkbq1e	ke2i1ila49c	5	\N	\N	\N
j2xilg2fkfc	ke2i1ila49c	4	\N	\N	\N
cyezqctu98x	ke2i1ila49c	3	\N	\N	\N
wx7qxj8vvq6	ke2i1ila49c	2	\N	\N	\N
ke2i1ila49c	ke2i1ila49c	0	f	field	\N
n17iu42tf4qfr1	ke2i1ila49c	1	\N	\N	1
n17tgpj7uku1rcb	n17itmmnxopj52m	9	\N	\N	\N
n17gqxvb782dhm	n17itmmnxopj52m	8	\N	\N	\N
n17tbcdlj6fd8nd	n17itmmnxopj52m	7	\N	\N	\N
n17anciuiqjj5z	n17itmmnxopj52m	6	\N	\N	\N
kbat1zt768b	n17itmmnxopj52m	5	\N	\N	\N
otq0qlkbq1e	n17itmmnxopj52m	4	\N	\N	\N
j2xilg2fkfc	n17itmmnxopj52m	3	\N	\N	\N
cyezqctu98x	n17itmmnxopj52m	2	\N	\N	\N
n17itmmnxopj52m	n17itmmnxopj52m	0	f	items	\N
wx7qxj8vvq6	n17itmmnxopj52m	1	\N	\N	5
n17tgpj7uku1rcb	u5qgoa53gta	10	\N	\N	\N
n17gqxvb782dhm	u5qgoa53gta	9	\N	\N	\N
n17tbcdlj6fd8nd	u5qgoa53gta	8	\N	\N	\N
n17anciuiqjj5z	u5qgoa53gta	7	\N	\N	\N
kbat1zt768b	u5qgoa53gta	6	\N	\N	\N
otq0qlkbq1e	u5qgoa53gta	5	\N	\N	\N
j2xilg2fkfc	u5qgoa53gta	4	\N	\N	\N
cyezqctu98x	u5qgoa53gta	3	\N	\N	\N
wx7qxj8vvq6	u5qgoa53gta	2	\N	\N	\N
u5qgoa53gta	u5qgoa53gta	0	f	field	\N
n17itmmnxopj52m	u5qgoa53gta	1	\N	\N	1
n17tgpj7uku1rcb	n17iwmyinli3rgl	9	\N	\N	\N
n17gqxvb782dhm	n17iwmyinli3rgl	8	\N	\N	\N
n17tbcdlj6fd8nd	n17iwmyinli3rgl	7	\N	\N	\N
n17anciuiqjj5z	n17iwmyinli3rgl	6	\N	\N	\N
kbat1zt768b	n17iwmyinli3rgl	5	\N	\N	\N
otq0qlkbq1e	n17iwmyinli3rgl	4	\N	\N	\N
j2xilg2fkfc	n17iwmyinli3rgl	3	\N	\N	\N
cyezqctu98x	n17iwmyinli3rgl	2	\N	\N	\N
n17iwmyinli3rgl	n17iwmyinli3rgl	0	f	items	\N
wx7qxj8vvq6	n17iwmyinli3rgl	1	\N	\N	6
n17tgpj7uku1rcb	hgy7wgd9ljh	10	\N	\N	\N
n17gqxvb782dhm	hgy7wgd9ljh	9	\N	\N	\N
n17tbcdlj6fd8nd	hgy7wgd9ljh	8	\N	\N	\N
n17anciuiqjj5z	hgy7wgd9ljh	7	\N	\N	\N
kbat1zt768b	hgy7wgd9ljh	6	\N	\N	\N
otq0qlkbq1e	hgy7wgd9ljh	5	\N	\N	\N
j2xilg2fkfc	hgy7wgd9ljh	4	\N	\N	\N
cyezqctu98x	hgy7wgd9ljh	3	\N	\N	\N
wx7qxj8vvq6	hgy7wgd9ljh	2	\N	\N	\N
hgy7wgd9ljh	hgy7wgd9ljh	0	f	field	\N
n17iwmyinli3rgl	hgy7wgd9ljh	1	\N	\N	1
n17tgpj7uku1rcb	n17rf9cys8w3ylp	3	\N	\N	\N
n17gqxvb782dhm	n17rf9cys8w3ylp	2	\N	\N	\N
n17rf9cys8w3ylp	n17rf9cys8w3ylp	0	f	actions	\N
n17tbcdlj6fd8nd	n17rf9cys8w3ylp	1	\N	\N	2
n17wr2jbz8fl2i	n17wr2jbz8fl2i	0	f	\N	\N
n17tx4b835evqu	n17tx4b835evqu	0	f	\N	\N
n17pinqjvjgypnk	n17pinqjvjgypnk	0	f	page	\N
n17wr2jbz8fl2i	n17pinqjvjgypnk	1	\N	\N	1
n17g16z4mi0ul0l	n17g16z4mi0ul0l	0	f	grid	\N
n17tx4b835evqu	n17g16z4mi0ul0l	1	\N	\N	1
n17tx4b835evqu	n17tbldvqz31qpl	2	\N	\N	\N
n17tbldvqz31qpl	n17tbldvqz31qpl	0	f	items	\N
n17g16z4mi0ul0l	n17tbldvqz31qpl	1	\N	\N	1
n17tx4b835evqu	n17c8pgkbuk6e64	3	\N	\N	\N
n17g16z4mi0ul0l	n17c8pgkbuk6e64	2	\N	\N	\N
n17c8pgkbuk6e64	n17c8pgkbuk6e64	0	f	columns	\N
n17tbldvqz31qpl	n17c8pgkbuk6e64	1	\N	\N	1
n17tx4b835evqu	n17c8pgkbuk6e64f	4	\N	\N	\N
n17g16z4mi0ul0l	n17c8pgkbuk6e64f	3	\N	\N	\N
n17tbldvqz31qpl	n17c8pgkbuk6e64f	2	\N	\N	\N
n17c8pgkbuk6e64f	n17c8pgkbuk6e64f	0	f	field	\N
n17c8pgkbuk6e64	n17c8pgkbuk6e64f	1	\N	\N	1
n17tx4b835evqu	n17ch6bazcr07d	3	\N	\N	\N
n17g16z4mi0ul0l	n17ch6bazcr07d	2	\N	\N	\N
n17ch6bazcr07d	n17ch6bazcr07d	0	f	columns	\N
n17tbldvqz31qpl	n17ch6bazcr07d	1	\N	\N	2
n17tx4b835evqu	n17ch6bazcr07df	4	\N	\N	\N
n17g16z4mi0ul0l	n17ch6bazcr07df	3	\N	\N	\N
n17tbldvqz31qpl	n17ch6bazcr07df	2	\N	\N	\N
n17ch6bazcr07df	n17ch6bazcr07df	0	f	field	\N
n17ch6bazcr07d	n17ch6bazcr07df	1	\N	\N	1
n17tx4b835evqu	n17crhxkwzf7sr	3	\N	\N	\N
n17g16z4mi0ul0l	n17crhxkwzf7sr	2	\N	\N	\N
n17crhxkwzf7sr	n17crhxkwzf7sr	0	f	columns	\N
n17tbldvqz31qpl	n17crhxkwzf7sr	1	\N	\N	3
n17tx4b835evqu	n17crhxkwzf7srf	4	\N	\N	\N
n17g16z4mi0ul0l	n17crhxkwzf7srf	3	\N	\N	\N
n17tbldvqz31qpl	n17crhxkwzf7srf	2	\N	\N	\N
n17crhxkwzf7srf	n17crhxkwzf7srf	0	f	field	\N
n17crhxkwzf7sr	n17crhxkwzf7srf	1	\N	\N	1
n17tx4b835evqu	n17cslr2i9g7kuf	3	\N	\N	\N
n17g16z4mi0ul0l	n17cslr2i9g7kuf	2	\N	\N	\N
n17cslr2i9g7kuf	n17cslr2i9g7kuf	0	f	columns	\N
n17tbldvqz31qpl	n17cslr2i9g7kuf	1	\N	\N	4
n17tx4b835evqu	n17cslr2i9g7kuff	4	\N	\N	\N
n17g16z4mi0ul0l	n17cslr2i9g7kuff	3	\N	\N	\N
n17tbldvqz31qpl	n17cslr2i9g7kuff	2	\N	\N	\N
n17cslr2i9g7kuff	n17cslr2i9g7kuff	0	f	field	\N
n17cslr2i9g7kuf	n17cslr2i9g7kuff	1	\N	\N	1
n17tx4b835evqu	n17c2fvyad2qtyf	3	\N	\N	\N
n17g16z4mi0ul0l	n17c2fvyad2qtyf	2	\N	\N	\N
n17c2fvyad2qtyf	n17c2fvyad2qtyf	0	f	columns	\N
n17tbldvqz31qpl	n17c2fvyad2qtyf	1	\N	\N	5
n17tx4b835evqu	n17c2fvyad2qtyff	4	\N	\N	\N
n17g16z4mi0ul0l	n17c2fvyad2qtyff	3	\N	\N	\N
n17tbldvqz31qpl	n17c2fvyad2qtyff	2	\N	\N	\N
n17c2fvyad2qtyff	n17c2fvyad2qtyff	0	f	field	\N
n17c2fvyad2qtyf	n17c2fvyad2qtyff	1	\N	\N	1
n17tx4b835evqu	n17an3n7pyb0h14s	3	\N	\N	\N
n17g16z4mi0ul0l	n17an3n7pyb0h14s	2	\N	\N	\N
n17an3n7pyb0h14s	n17an3n7pyb0h14s	0	f	actions	\N
n17tbldvqz31qpl	n17an3n7pyb0h14s	1	\N	\N	1
n17tx4b835evqu	u45ktzo11wr	4	\N	\N	\N
n17g16z4mi0ul0l	u45ktzo11wr	3	\N	\N	\N
n17tbldvqz31qpl	u45ktzo11wr	2	\N	\N	\N
u45ktzo11wr	u45ktzo11wr	0	f	page	\N
n17an3n7pyb0h14s	u45ktzo11wr	1	\N	\N	1
n17tx4b835evqu	if5cnn4gway	5	\N	\N	\N
n17g16z4mi0ul0l	if5cnn4gway	4	\N	\N	\N
n17tbldvqz31qpl	if5cnn4gway	3	\N	\N	\N
n17an3n7pyb0h14s	if5cnn4gway	2	\N	\N	\N
if5cnn4gway	if5cnn4gway	0	f	tabs	\N
u45ktzo11wr	if5cnn4gway	1	\N	\N	1
n17tx4b835evqu	je1kdt8x04z	6	\N	\N	\N
n17g16z4mi0ul0l	je1kdt8x04z	5	\N	\N	\N
n17tbldvqz31qpl	je1kdt8x04z	4	\N	\N	\N
n17an3n7pyb0h14s	je1kdt8x04z	3	\N	\N	\N
u45ktzo11wr	je1kdt8x04z	2	\N	\N	\N
je1kdt8x04z	je1kdt8x04z	0	f	grid	\N
if5cnn4gway	je1kdt8x04z	1	\N	\N	1
n17tx4b835evqu	s32m18vob1c	7	\N	\N	\N
n17g16z4mi0ul0l	s32m18vob1c	6	\N	\N	\N
n17tbldvqz31qpl	s32m18vob1c	5	\N	\N	\N
n17an3n7pyb0h14s	s32m18vob1c	4	\N	\N	\N
u45ktzo11wr	s32m18vob1c	3	\N	\N	\N
if5cnn4gway	s32m18vob1c	2	\N	\N	\N
s32m18vob1c	s32m18vob1c	0	f	items	\N
je1kdt8x04z	s32m18vob1c	1	\N	\N	1
n17tx4b835evqu	y7p33m8aqt0	8	\N	\N	\N
n17g16z4mi0ul0l	y7p33m8aqt0	7	\N	\N	\N
n17tbldvqz31qpl	y7p33m8aqt0	6	\N	\N	\N
n17an3n7pyb0h14s	y7p33m8aqt0	5	\N	\N	\N
u45ktzo11wr	y7p33m8aqt0	4	\N	\N	\N
if5cnn4gway	y7p33m8aqt0	3	\N	\N	\N
je1kdt8x04z	y7p33m8aqt0	2	\N	\N	\N
y7p33m8aqt0	y7p33m8aqt0	0	f	grid	\N
s32m18vob1c	y7p33m8aqt0	1	\N	\N	1
n17tx4b835evqu	n17ixcp82sn2hor	9	\N	\N	\N
n17g16z4mi0ul0l	n17ixcp82sn2hor	8	\N	\N	\N
n17tbldvqz31qpl	n17ixcp82sn2hor	7	\N	\N	\N
n17an3n7pyb0h14s	n17ixcp82sn2hor	6	\N	\N	\N
u45ktzo11wr	n17ixcp82sn2hor	5	\N	\N	\N
if5cnn4gway	n17ixcp82sn2hor	4	\N	\N	\N
je1kdt8x04z	n17ixcp82sn2hor	3	\N	\N	\N
s32m18vob1c	n17ixcp82sn2hor	2	\N	\N	\N
n17ixcp82sn2hor	n17ixcp82sn2hor	0	f	items	\N
y7p33m8aqt0	n17ixcp82sn2hor	1	\N	\N	1
n17tx4b835evqu	1dwn5ymmiz5	10	\N	\N	\N
n17g16z4mi0ul0l	1dwn5ymmiz5	9	\N	\N	\N
n17tbldvqz31qpl	1dwn5ymmiz5	8	\N	\N	\N
n17an3n7pyb0h14s	1dwn5ymmiz5	7	\N	\N	\N
u45ktzo11wr	1dwn5ymmiz5	6	\N	\N	\N
if5cnn4gway	1dwn5ymmiz5	5	\N	\N	\N
je1kdt8x04z	1dwn5ymmiz5	4	\N	\N	\N
s32m18vob1c	1dwn5ymmiz5	3	\N	\N	\N
y7p33m8aqt0	1dwn5ymmiz5	2	\N	\N	\N
1dwn5ymmiz5	1dwn5ymmiz5	0	f	field	\N
n17ixcp82sn2hor	1dwn5ymmiz5	1	\N	\N	1
n17tx4b835evqu	n17iu4nahi79te	9	\N	\N	\N
n17g16z4mi0ul0l	n17iu4nahi79te	8	\N	\N	\N
n17tbldvqz31qpl	n17iu4nahi79te	7	\N	\N	\N
n17an3n7pyb0h14s	n17iu4nahi79te	6	\N	\N	\N
u45ktzo11wr	n17iu4nahi79te	5	\N	\N	\N
if5cnn4gway	n17iu4nahi79te	4	\N	\N	\N
je1kdt8x04z	n17iu4nahi79te	3	\N	\N	\N
s32m18vob1c	n17iu4nahi79te	2	\N	\N	\N
n17iu4nahi79te	n17iu4nahi79te	0	f	items	\N
y7p33m8aqt0	n17iu4nahi79te	1	\N	\N	2
n17tx4b835evqu	locni456m4e	10	\N	\N	\N
n17g16z4mi0ul0l	locni456m4e	9	\N	\N	\N
n17tbldvqz31qpl	locni456m4e	8	\N	\N	\N
n17an3n7pyb0h14s	locni456m4e	7	\N	\N	\N
u45ktzo11wr	locni456m4e	6	\N	\N	\N
if5cnn4gway	locni456m4e	5	\N	\N	\N
je1kdt8x04z	locni456m4e	4	\N	\N	\N
s32m18vob1c	locni456m4e	3	\N	\N	\N
y7p33m8aqt0	locni456m4e	2	\N	\N	\N
locni456m4e	locni456m4e	0	f	field	\N
n17iu4nahi79te	locni456m4e	1	\N	\N	1
n17tx4b835evqu	n17imdtmtmid84l	9	\N	\N	\N
n17g16z4mi0ul0l	n17imdtmtmid84l	8	\N	\N	\N
n17tbldvqz31qpl	n17imdtmtmid84l	7	\N	\N	\N
n17an3n7pyb0h14s	n17imdtmtmid84l	6	\N	\N	\N
u45ktzo11wr	n17imdtmtmid84l	5	\N	\N	\N
if5cnn4gway	n17imdtmtmid84l	4	\N	\N	\N
je1kdt8x04z	n17imdtmtmid84l	3	\N	\N	\N
s32m18vob1c	n17imdtmtmid84l	2	\N	\N	\N
n17imdtmtmid84l	n17imdtmtmid84l	0	f	items	\N
y7p33m8aqt0	n17imdtmtmid84l	1	\N	\N	3
n17tx4b835evqu	qrhl7c59gro	10	\N	\N	\N
n17g16z4mi0ul0l	qrhl7c59gro	9	\N	\N	\N
n17tbldvqz31qpl	qrhl7c59gro	8	\N	\N	\N
n17an3n7pyb0h14s	qrhl7c59gro	7	\N	\N	\N
u45ktzo11wr	qrhl7c59gro	6	\N	\N	\N
if5cnn4gway	qrhl7c59gro	5	\N	\N	\N
je1kdt8x04z	qrhl7c59gro	4	\N	\N	\N
s32m18vob1c	qrhl7c59gro	3	\N	\N	\N
y7p33m8aqt0	qrhl7c59gro	2	\N	\N	\N
qrhl7c59gro	qrhl7c59gro	0	f	field	\N
n17imdtmtmid84l	qrhl7c59gro	1	\N	\N	1
n17tx4b835evqu	n17i3qu8kc1enpm	9	\N	\N	\N
n17g16z4mi0ul0l	n17i3qu8kc1enpm	8	\N	\N	\N
n17tbldvqz31qpl	n17i3qu8kc1enpm	7	\N	\N	\N
n17an3n7pyb0h14s	n17i3qu8kc1enpm	6	\N	\N	\N
u45ktzo11wr	n17i3qu8kc1enpm	5	\N	\N	\N
if5cnn4gway	n17i3qu8kc1enpm	4	\N	\N	\N
je1kdt8x04z	n17i3qu8kc1enpm	3	\N	\N	\N
s32m18vob1c	n17i3qu8kc1enpm	2	\N	\N	\N
n17i3qu8kc1enpm	n17i3qu8kc1enpm	0	f	items	\N
y7p33m8aqt0	n17i3qu8kc1enpm	1	\N	\N	4
n17tx4b835evqu	309w5lj1xh3	10	\N	\N	\N
n17g16z4mi0ul0l	309w5lj1xh3	9	\N	\N	\N
n17tbldvqz31qpl	309w5lj1xh3	8	\N	\N	\N
n17an3n7pyb0h14s	309w5lj1xh3	7	\N	\N	\N
u45ktzo11wr	309w5lj1xh3	6	\N	\N	\N
if5cnn4gway	309w5lj1xh3	5	\N	\N	\N
je1kdt8x04z	309w5lj1xh3	4	\N	\N	\N
s32m18vob1c	309w5lj1xh3	3	\N	\N	\N
y7p33m8aqt0	309w5lj1xh3	2	\N	\N	\N
309w5lj1xh3	309w5lj1xh3	0	f	field	\N
n17i3qu8kc1enpm	309w5lj1xh3	1	\N	\N	1
n17tx4b835evqu	n17itcutwj584r	9	\N	\N	\N
n17g16z4mi0ul0l	n17itcutwj584r	8	\N	\N	\N
n17tbldvqz31qpl	n17itcutwj584r	7	\N	\N	\N
n17an3n7pyb0h14s	n17itcutwj584r	6	\N	\N	\N
u45ktzo11wr	n17itcutwj584r	5	\N	\N	\N
if5cnn4gway	n17itcutwj584r	4	\N	\N	\N
je1kdt8x04z	n17itcutwj584r	3	\N	\N	\N
s32m18vob1c	n17itcutwj584r	2	\N	\N	\N
n17itcutwj584r	n17itcutwj584r	0	f	items	\N
y7p33m8aqt0	n17itcutwj584r	1	\N	\N	5
n17tx4b835evqu	7cfskbf9pgq	10	\N	\N	\N
n17g16z4mi0ul0l	7cfskbf9pgq	9	\N	\N	\N
n17tbldvqz31qpl	7cfskbf9pgq	8	\N	\N	\N
n17an3n7pyb0h14s	7cfskbf9pgq	7	\N	\N	\N
u45ktzo11wr	7cfskbf9pgq	6	\N	\N	\N
if5cnn4gway	7cfskbf9pgq	5	\N	\N	\N
je1kdt8x04z	7cfskbf9pgq	4	\N	\N	\N
s32m18vob1c	7cfskbf9pgq	3	\N	\N	\N
y7p33m8aqt0	7cfskbf9pgq	2	\N	\N	\N
7cfskbf9pgq	7cfskbf9pgq	0	f	field	\N
n17itcutwj584r	7cfskbf9pgq	1	\N	\N	1
n17tx4b835evqu	n17rf0cj9ogkds2h	3	\N	\N	\N
n17g16z4mi0ul0l	n17rf0cj9ogkds2h	2	\N	\N	\N
n17rf0cj9ogkds2h	n17rf0cj9ogkds2h	0	f	actions	\N
n17tbldvqz31qpl	n17rf0cj9ogkds2h	1	\N	\N	2
n17lhe5qyxu1g	n17lhe5qyxu1g	0	f	\N	\N
n17t2r7mq7n0zol	n17t2r7mq7n0zol	0	f	\N	\N
n17pjscv951m1bt	n17pjscv951m1bt	0	f	page	\N
n17lhe5qyxu1g	n17pjscv951m1bt	1	\N	\N	1
n17gk3c58z6a4np	n17gk3c58z6a4np	0	f	grid	\N
n17t2r7mq7n0zol	n17gk3c58z6a4np	1	\N	\N	1
n17t2r7mq7n0zol	n17tbc55f9eivj9	2	\N	\N	\N
n17tbc55f9eivj9	n17tbc55f9eivj9	0	f	items	\N
n17gk3c58z6a4np	n17tbc55f9eivj9	1	\N	\N	1
n17t2r7mq7n0zol	n17cjbsfx4arh6j	3	\N	\N	\N
n17gk3c58z6a4np	n17cjbsfx4arh6j	2	\N	\N	\N
n17cjbsfx4arh6j	n17cjbsfx4arh6j	0	f	columns	\N
n17tbc55f9eivj9	n17cjbsfx4arh6j	1	\N	\N	1
n17t2r7mq7n0zol	n17cjbsfx4arh6jf	4	\N	\N	\N
n17gk3c58z6a4np	n17cjbsfx4arh6jf	3	\N	\N	\N
n17tbc55f9eivj9	n17cjbsfx4arh6jf	2	\N	\N	\N
n17cjbsfx4arh6jf	n17cjbsfx4arh6jf	0	f	field	\N
n17cjbsfx4arh6j	n17cjbsfx4arh6jf	1	\N	\N	1
n17t2r7mq7n0zol	n17cyubpij6h4lk	3	\N	\N	\N
n17gk3c58z6a4np	n17cyubpij6h4lk	2	\N	\N	\N
n17cyubpij6h4lk	n17cyubpij6h4lk	0	f	columns	\N
n17tbc55f9eivj9	n17cyubpij6h4lk	1	\N	\N	2
n17t2r7mq7n0zol	n17cyubpij6h4lkf	4	\N	\N	\N
n17gk3c58z6a4np	n17cyubpij6h4lkf	3	\N	\N	\N
n17tbc55f9eivj9	n17cyubpij6h4lkf	2	\N	\N	\N
n17cyubpij6h4lkf	n17cyubpij6h4lkf	0	f	field	\N
n17cyubpij6h4lk	n17cyubpij6h4lkf	1	\N	\N	1
n17t2r7mq7n0zol	n17cy8c0nc16uc	3	\N	\N	\N
n17gk3c58z6a4np	n17cy8c0nc16uc	2	\N	\N	\N
n17cy8c0nc16uc	n17cy8c0nc16uc	0	f	columns	\N
n17tbc55f9eivj9	n17cy8c0nc16uc	1	\N	\N	3
n17t2r7mq7n0zol	n17cy8c0nc16ucf	4	\N	\N	\N
n17gk3c58z6a4np	n17cy8c0nc16ucf	3	\N	\N	\N
n17tbc55f9eivj9	n17cy8c0nc16ucf	2	\N	\N	\N
n17cy8c0nc16ucf	n17cy8c0nc16ucf	0	f	field	\N
n17cy8c0nc16uc	n17cy8c0nc16ucf	1	\N	\N	1
n17t2r7mq7n0zol	n17cvspe88cgfz	3	\N	\N	\N
n17gk3c58z6a4np	n17cvspe88cgfz	2	\N	\N	\N
n17cvspe88cgfz	n17cvspe88cgfz	0	f	columns	\N
n17tbc55f9eivj9	n17cvspe88cgfz	1	\N	\N	4
n17t2r7mq7n0zol	n17cvspe88cgfzf	4	\N	\N	\N
n17gk3c58z6a4np	n17cvspe88cgfzf	3	\N	\N	\N
n17tbc55f9eivj9	n17cvspe88cgfzf	2	\N	\N	\N
n17cvspe88cgfzf	n17cvspe88cgfzf	0	f	field	\N
n17cvspe88cgfz	n17cvspe88cgfzf	1	\N	\N	1
n17t2r7mq7n0zol	n17c908ttlh9dy	3	\N	\N	\N
n17gk3c58z6a4np	n17c908ttlh9dy	2	\N	\N	\N
n17c908ttlh9dy	n17c908ttlh9dy	0	f	columns	\N
n17tbc55f9eivj9	n17c908ttlh9dy	1	\N	\N	5
n17t2r7mq7n0zol	n17c908ttlh9dyf	4	\N	\N	\N
n17gk3c58z6a4np	n17c908ttlh9dyf	3	\N	\N	\N
n17tbc55f9eivj9	n17c908ttlh9dyf	2	\N	\N	\N
n17c908ttlh9dyf	n17c908ttlh9dyf	0	f	field	\N
n17c908ttlh9dy	n17c908ttlh9dyf	1	\N	\N	1
n17t2r7mq7n0zol	n17an3rxdfkv2dcg	3	\N	\N	\N
n17gk3c58z6a4np	n17an3rxdfkv2dcg	2	\N	\N	\N
n17an3rxdfkv2dcg	n17an3rxdfkv2dcg	0	f	actions	\N
n17tbc55f9eivj9	n17an3rxdfkv2dcg	1	\N	\N	1
n17t2r7mq7n0zol	pt0c8yc6aux	4	\N	\N	\N
n17gk3c58z6a4np	pt0c8yc6aux	3	\N	\N	\N
n17tbc55f9eivj9	pt0c8yc6aux	2	\N	\N	\N
pt0c8yc6aux	pt0c8yc6aux	0	f	page	\N
n17an3rxdfkv2dcg	pt0c8yc6aux	1	\N	\N	1
n17t2r7mq7n0zol	ozhtoox7sm4	5	\N	\N	\N
n17gk3c58z6a4np	ozhtoox7sm4	4	\N	\N	\N
n17tbc55f9eivj9	ozhtoox7sm4	3	\N	\N	\N
n17an3rxdfkv2dcg	ozhtoox7sm4	2	\N	\N	\N
ozhtoox7sm4	ozhtoox7sm4	0	f	tabs	\N
pt0c8yc6aux	ozhtoox7sm4	1	\N	\N	1
n17t2r7mq7n0zol	bc8jfbp20jd	6	\N	\N	\N
n17gk3c58z6a4np	bc8jfbp20jd	5	\N	\N	\N
n17tbc55f9eivj9	bc8jfbp20jd	4	\N	\N	\N
n17an3rxdfkv2dcg	bc8jfbp20jd	3	\N	\N	\N
pt0c8yc6aux	bc8jfbp20jd	2	\N	\N	\N
bc8jfbp20jd	bc8jfbp20jd	0	f	grid	\N
ozhtoox7sm4	bc8jfbp20jd	1	\N	\N	1
n17t2r7mq7n0zol	ts03aroo4ah	7	\N	\N	\N
n17gk3c58z6a4np	ts03aroo4ah	6	\N	\N	\N
n17tbc55f9eivj9	ts03aroo4ah	5	\N	\N	\N
n17an3rxdfkv2dcg	ts03aroo4ah	4	\N	\N	\N
pt0c8yc6aux	ts03aroo4ah	3	\N	\N	\N
ozhtoox7sm4	ts03aroo4ah	2	\N	\N	\N
ts03aroo4ah	ts03aroo4ah	0	f	items	\N
bc8jfbp20jd	ts03aroo4ah	1	\N	\N	1
n17t2r7mq7n0zol	09bvmy800vm	8	\N	\N	\N
n17gk3c58z6a4np	09bvmy800vm	7	\N	\N	\N
n17tbc55f9eivj9	09bvmy800vm	6	\N	\N	\N
n17an3rxdfkv2dcg	09bvmy800vm	5	\N	\N	\N
pt0c8yc6aux	09bvmy800vm	4	\N	\N	\N
ozhtoox7sm4	09bvmy800vm	3	\N	\N	\N
bc8jfbp20jd	09bvmy800vm	2	\N	\N	\N
09bvmy800vm	09bvmy800vm	0	f	grid	\N
ts03aroo4ah	09bvmy800vm	1	\N	\N	1
n17t2r7mq7n0zol	n17ioagutsidh5k	9	\N	\N	\N
n17gk3c58z6a4np	n17ioagutsidh5k	8	\N	\N	\N
n17tbc55f9eivj9	n17ioagutsidh5k	7	\N	\N	\N
n17an3rxdfkv2dcg	n17ioagutsidh5k	6	\N	\N	\N
pt0c8yc6aux	n17ioagutsidh5k	5	\N	\N	\N
ozhtoox7sm4	n17ioagutsidh5k	4	\N	\N	\N
bc8jfbp20jd	n17ioagutsidh5k	3	\N	\N	\N
ts03aroo4ah	n17ioagutsidh5k	2	\N	\N	\N
n17ioagutsidh5k	n17ioagutsidh5k	0	f	items	\N
09bvmy800vm	n17ioagutsidh5k	1	\N	\N	1
n17t2r7mq7n0zol	s4gpbgzoq0f	10	\N	\N	\N
n17gk3c58z6a4np	s4gpbgzoq0f	9	\N	\N	\N
n17tbc55f9eivj9	s4gpbgzoq0f	8	\N	\N	\N
n17an3rxdfkv2dcg	s4gpbgzoq0f	7	\N	\N	\N
pt0c8yc6aux	s4gpbgzoq0f	6	\N	\N	\N
ozhtoox7sm4	s4gpbgzoq0f	5	\N	\N	\N
bc8jfbp20jd	s4gpbgzoq0f	4	\N	\N	\N
ts03aroo4ah	s4gpbgzoq0f	3	\N	\N	\N
09bvmy800vm	s4gpbgzoq0f	2	\N	\N	\N
s4gpbgzoq0f	s4gpbgzoq0f	0	f	field	\N
n17ioagutsidh5k	s4gpbgzoq0f	1	\N	\N	1
n17t2r7mq7n0zol	n17ikcm5pqyaj0q	9	\N	\N	\N
n17gk3c58z6a4np	n17ikcm5pqyaj0q	8	\N	\N	\N
n17tbc55f9eivj9	n17ikcm5pqyaj0q	7	\N	\N	\N
n17an3rxdfkv2dcg	n17ikcm5pqyaj0q	6	\N	\N	\N
pt0c8yc6aux	n17ikcm5pqyaj0q	5	\N	\N	\N
ozhtoox7sm4	n17ikcm5pqyaj0q	4	\N	\N	\N
bc8jfbp20jd	n17ikcm5pqyaj0q	3	\N	\N	\N
ts03aroo4ah	n17ikcm5pqyaj0q	2	\N	\N	\N
n17ikcm5pqyaj0q	n17ikcm5pqyaj0q	0	f	items	\N
09bvmy800vm	n17ikcm5pqyaj0q	1	\N	\N	2
n17t2r7mq7n0zol	qo0jrarc6dk	10	\N	\N	\N
n17gk3c58z6a4np	qo0jrarc6dk	9	\N	\N	\N
n17tbc55f9eivj9	qo0jrarc6dk	8	\N	\N	\N
n17an3rxdfkv2dcg	qo0jrarc6dk	7	\N	\N	\N
pt0c8yc6aux	qo0jrarc6dk	6	\N	\N	\N
ozhtoox7sm4	qo0jrarc6dk	5	\N	\N	\N
bc8jfbp20jd	qo0jrarc6dk	4	\N	\N	\N
ts03aroo4ah	qo0jrarc6dk	3	\N	\N	\N
09bvmy800vm	qo0jrarc6dk	2	\N	\N	\N
qo0jrarc6dk	qo0jrarc6dk	0	f	field	\N
n17ikcm5pqyaj0q	qo0jrarc6dk	1	\N	\N	1
n17t2r7mq7n0zol	n17iy2uxhuz1vi	9	\N	\N	\N
n17gk3c58z6a4np	n17iy2uxhuz1vi	8	\N	\N	\N
n17tbc55f9eivj9	n17iy2uxhuz1vi	7	\N	\N	\N
n17an3rxdfkv2dcg	n17iy2uxhuz1vi	6	\N	\N	\N
pt0c8yc6aux	n17iy2uxhuz1vi	5	\N	\N	\N
ozhtoox7sm4	n17iy2uxhuz1vi	4	\N	\N	\N
bc8jfbp20jd	n17iy2uxhuz1vi	3	\N	\N	\N
ts03aroo4ah	n17iy2uxhuz1vi	2	\N	\N	\N
n17iy2uxhuz1vi	n17iy2uxhuz1vi	0	f	items	\N
09bvmy800vm	n17iy2uxhuz1vi	1	\N	\N	3
n17t2r7mq7n0zol	0dc0c0ana94	10	\N	\N	\N
n17gk3c58z6a4np	0dc0c0ana94	9	\N	\N	\N
n17tbc55f9eivj9	0dc0c0ana94	8	\N	\N	\N
n17an3rxdfkv2dcg	0dc0c0ana94	7	\N	\N	\N
pt0c8yc6aux	0dc0c0ana94	6	\N	\N	\N
ozhtoox7sm4	0dc0c0ana94	5	\N	\N	\N
bc8jfbp20jd	0dc0c0ana94	4	\N	\N	\N
ts03aroo4ah	0dc0c0ana94	3	\N	\N	\N
09bvmy800vm	0dc0c0ana94	2	\N	\N	\N
0dc0c0ana94	0dc0c0ana94	0	f	field	\N
n17iy2uxhuz1vi	0dc0c0ana94	1	\N	\N	1
n17t2r7mq7n0zol	n17ihaqowd6qx27	9	\N	\N	\N
n17gk3c58z6a4np	n17ihaqowd6qx27	8	\N	\N	\N
n17tbc55f9eivj9	n17ihaqowd6qx27	7	\N	\N	\N
n17an3rxdfkv2dcg	n17ihaqowd6qx27	6	\N	\N	\N
pt0c8yc6aux	n17ihaqowd6qx27	5	\N	\N	\N
ozhtoox7sm4	n17ihaqowd6qx27	4	\N	\N	\N
bc8jfbp20jd	n17ihaqowd6qx27	3	\N	\N	\N
ts03aroo4ah	n17ihaqowd6qx27	2	\N	\N	\N
n17ihaqowd6qx27	n17ihaqowd6qx27	0	f	items	\N
09bvmy800vm	n17ihaqowd6qx27	1	\N	\N	4
n17t2r7mq7n0zol	dcj1hbaasac	10	\N	\N	\N
n17gk3c58z6a4np	dcj1hbaasac	9	\N	\N	\N
n17tbc55f9eivj9	dcj1hbaasac	8	\N	\N	\N
n17an3rxdfkv2dcg	dcj1hbaasac	7	\N	\N	\N
pt0c8yc6aux	dcj1hbaasac	6	\N	\N	\N
ozhtoox7sm4	dcj1hbaasac	5	\N	\N	\N
bc8jfbp20jd	dcj1hbaasac	4	\N	\N	\N
ts03aroo4ah	dcj1hbaasac	3	\N	\N	\N
09bvmy800vm	dcj1hbaasac	2	\N	\N	\N
dcj1hbaasac	dcj1hbaasac	0	f	field	\N
n17ihaqowd6qx27	dcj1hbaasac	1	\N	\N	1
n17t2r7mq7n0zol	n17im5r0b69pyc	9	\N	\N	\N
n17gk3c58z6a4np	n17im5r0b69pyc	8	\N	\N	\N
n17tbc55f9eivj9	n17im5r0b69pyc	7	\N	\N	\N
n17an3rxdfkv2dcg	n17im5r0b69pyc	6	\N	\N	\N
pt0c8yc6aux	n17im5r0b69pyc	5	\N	\N	\N
ozhtoox7sm4	n17im5r0b69pyc	4	\N	\N	\N
bc8jfbp20jd	n17im5r0b69pyc	3	\N	\N	\N
ts03aroo4ah	n17im5r0b69pyc	2	\N	\N	\N
n17im5r0b69pyc	n17im5r0b69pyc	0	f	items	\N
09bvmy800vm	n17im5r0b69pyc	1	\N	\N	5
n17t2r7mq7n0zol	xfpaufi552t	10	\N	\N	\N
n17gk3c58z6a4np	xfpaufi552t	9	\N	\N	\N
n17tbc55f9eivj9	xfpaufi552t	8	\N	\N	\N
n17an3rxdfkv2dcg	xfpaufi552t	7	\N	\N	\N
pt0c8yc6aux	xfpaufi552t	6	\N	\N	\N
ozhtoox7sm4	xfpaufi552t	5	\N	\N	\N
bc8jfbp20jd	xfpaufi552t	4	\N	\N	\N
ts03aroo4ah	xfpaufi552t	3	\N	\N	\N
09bvmy800vm	xfpaufi552t	2	\N	\N	\N
xfpaufi552t	xfpaufi552t	0	f	field	\N
n17im5r0b69pyc	xfpaufi552t	1	\N	\N	1
n17t2r7mq7n0zol	n17rfoy5a45e5yq8	3	\N	\N	\N
n17gk3c58z6a4np	n17rfoy5a45e5yq8	2	\N	\N	\N
n17rfoy5a45e5yq8	n17rfoy5a45e5yq8	0	f	actions	\N
n17tbc55f9eivj9	n17rfoy5a45e5yq8	1	\N	\N	2
n17tfgec1j85e5d	n17sb-96vmjc93frt	8	\N	\N	\N
n17gzmr0v7w14r	n17sb-96vmjc93frt	7	\N	\N	\N
n17tbe5sj8dsvieh	n17sb-96vmjc93frt	6	\N	\N	\N
n17angirk9efi9st	n17sb-96vmjc93frt	5	\N	\N	\N
ah559fbkpwr	n17sb-96vmjc93frt	4	\N	\N	\N
0cwxawsd75b	n17sb-96vmjc93frt	3	\N	\N	\N
jgpe2vqzhh3	n17sb-96vmjc93frt	2	\N	\N	\N
n17sb-96vmjc93frt	n17sb-96vmjc93frt	0	f	actions	\N
96vmjc93frt	n17sb-96vmjc93frt	1	\N	\N	1
n17tgpj7uku1rcb	n17sb-cyezqctu98x	8	\N	\N	\N
n17gqxvb782dhm	n17sb-cyezqctu98x	7	\N	\N	\N
n17tbcdlj6fd8nd	n17sb-cyezqctu98x	6	\N	\N	\N
n17anciuiqjj5z	n17sb-cyezqctu98x	5	\N	\N	\N
kbat1zt768b	n17sb-cyezqctu98x	4	\N	\N	\N
otq0qlkbq1e	n17sb-cyezqctu98x	3	\N	\N	\N
j2xilg2fkfc	n17sb-cyezqctu98x	2	\N	\N	\N
n17sb-cyezqctu98x	n17sb-cyezqctu98x	0	f	actions	\N
cyezqctu98x	n17sb-cyezqctu98x	1	\N	\N	1
n17tnmwqho6hgl	n17sb-dy1sditid2j	8	\N	\N	\N
n17gvcpaqeznhk	n17sb-dy1sditid2j	7	\N	\N	\N
n17tbgfz3oq90r98	n17sb-dy1sditid2j	6	\N	\N	\N
n17an3pzasuzakqa	n17sb-dy1sditid2j	5	\N	\N	\N
rmwvn2jti6p	n17sb-dy1sditid2j	4	\N	\N	\N
jqhsxkjhjqx	n17sb-dy1sditid2j	3	\N	\N	\N
5p1pe58rs68	n17sb-dy1sditid2j	2	\N	\N	\N
n17sb-dy1sditid2j	n17sb-dy1sditid2j	0	f	actions	\N
dy1sditid2j	n17sb-dy1sditid2j	1	\N	\N	1
n17t12fezb0kdm6	n17sb-fg8vgdeq8o9	8	\N	\N	\N
n17gpu69sz1v3x	n17sb-fg8vgdeq8o9	7	\N	\N	\N
n17tbmigqv76d79	n17sb-fg8vgdeq8o9	6	\N	\N	\N
n17anojyqup3vyyq	n17sb-fg8vgdeq8o9	5	\N	\N	\N
27uizyaoeom	n17sb-fg8vgdeq8o9	4	\N	\N	\N
g6ajx0tunfr	n17sb-fg8vgdeq8o9	3	\N	\N	\N
p4tfbl9ywsv	n17sb-fg8vgdeq8o9	2	\N	\N	\N
n17sb-fg8vgdeq8o9	n17sb-fg8vgdeq8o9	0	f	actions	\N
fg8vgdeq8o9	n17sb-fg8vgdeq8o9	1	\N	\N	1
n17tx4b835evqu	n17sb-s32m18vob1c	8	\N	\N	\N
n17g16z4mi0ul0l	n17sb-s32m18vob1c	7	\N	\N	\N
n17tbldvqz31qpl	n17sb-s32m18vob1c	6	\N	\N	\N
n17an3n7pyb0h14s	n17sb-s32m18vob1c	5	\N	\N	\N
u45ktzo11wr	n17sb-s32m18vob1c	4	\N	\N	\N
if5cnn4gway	n17sb-s32m18vob1c	3	\N	\N	\N
je1kdt8x04z	n17sb-s32m18vob1c	2	\N	\N	\N
n17sb-s32m18vob1c	n17sb-s32m18vob1c	0	f	actions	\N
s32m18vob1c	n17sb-s32m18vob1c	1	\N	\N	1
n17tkf0ipg15b6	n17sb-sy34mnly8c6	8	\N	\N	\N
n17gnxg1hj63t2	n17sb-sy34mnly8c6	7	\N	\N	\N
n17tbgrzqc88xbuu	n17sb-sy34mnly8c6	6	\N	\N	\N
n17anpa81ofl9ky	n17sb-sy34mnly8c6	5	\N	\N	\N
ii09dv79a3x	n17sb-sy34mnly8c6	4	\N	\N	\N
u2p6hsshmzu	n17sb-sy34mnly8c6	3	\N	\N	\N
1zx5qopep7e	n17sb-sy34mnly8c6	2	\N	\N	\N
n17sb-sy34mnly8c6	n17sb-sy34mnly8c6	0	f	actions	\N
sy34mnly8c6	n17sb-sy34mnly8c6	1	\N	\N	1
n17t2r7mq7n0zol	n17sb-ts03aroo4ah	8	\N	\N	\N
n17gk3c58z6a4np	n17sb-ts03aroo4ah	7	\N	\N	\N
n17tbc55f9eivj9	n17sb-ts03aroo4ah	6	\N	\N	\N
n17an3rxdfkv2dcg	n17sb-ts03aroo4ah	5	\N	\N	\N
pt0c8yc6aux	n17sb-ts03aroo4ah	4	\N	\N	\N
ozhtoox7sm4	n17sb-ts03aroo4ah	3	\N	\N	\N
bc8jfbp20jd	n17sb-ts03aroo4ah	2	\N	\N	\N
n17sb-ts03aroo4ah	n17sb-ts03aroo4ah	0	f	actions	\N
ts03aroo4ah	n17sb-ts03aroo4ah	1	\N	\N	1
n17tfyodvrkcq0d	n17sb-wqlv319eqdf	8	\N	\N	\N
n17gksef074rhx	n17sb-wqlv319eqdf	7	\N	\N	\N
n17tb34ir6hawk2h	n17sb-wqlv319eqdf	6	\N	\N	\N
n17an0vjd9gwrc3c	n17sb-wqlv319eqdf	5	\N	\N	\N
ecductxt41c	n17sb-wqlv319eqdf	4	\N	\N	\N
wnv9hj3i2cg	n17sb-wqlv319eqdf	3	\N	\N	\N
ie0pp6rvvhe	n17sb-wqlv319eqdf	2	\N	\N	\N
n17sb-wqlv319eqdf	n17sb-wqlv319eqdf	0	f	actions	\N
wqlv319eqdf	n17sb-wqlv319eqdf	1	\N	\N	1
5wcgnfdc2no	5wcgnfdc2no	0	f	\N	\N
nk75hjjv28u	nk75hjjv28u	0	f	\N	\N
n17tfgec1j85e5d	n18ai-96vmjc93frt	8	\N	\N	\N
n17gzmr0v7w14r	n18ai-96vmjc93frt	7	\N	\N	\N
n17tbe5sj8dsvieh	n18ai-96vmjc93frt	6	\N	\N	\N
n17angirk9efi9st	n18ai-96vmjc93frt	5	\N	\N	\N
ah559fbkpwr	n18ai-96vmjc93frt	4	\N	\N	\N
0cwxawsd75b	n18ai-96vmjc93frt	3	\N	\N	\N
jgpe2vqzhh3	n18ai-96vmjc93frt	2	\N	\N	\N
n18ai-96vmjc93frt	n18ai-96vmjc93frt	0	f	actions	\N
96vmjc93frt	n18ai-96vmjc93frt	1	\N	\N	2
n17tgpj7uku1rcb	n18ai-cyezqctu98x	8	\N	\N	\N
n17gqxvb782dhm	n18ai-cyezqctu98x	7	\N	\N	\N
n17tbcdlj6fd8nd	n18ai-cyezqctu98x	6	\N	\N	\N
n17anciuiqjj5z	n18ai-cyezqctu98x	5	\N	\N	\N
kbat1zt768b	n18ai-cyezqctu98x	4	\N	\N	\N
otq0qlkbq1e	n18ai-cyezqctu98x	3	\N	\N	\N
j2xilg2fkfc	n18ai-cyezqctu98x	2	\N	\N	\N
n18ai-cyezqctu98x	n18ai-cyezqctu98x	0	f	actions	\N
cyezqctu98x	n18ai-cyezqctu98x	1	\N	\N	2
n17tnmwqho6hgl	n18ai-dy1sditid2j	8	\N	\N	\N
n17gvcpaqeznhk	n18ai-dy1sditid2j	7	\N	\N	\N
n17tbgfz3oq90r98	n18ai-dy1sditid2j	6	\N	\N	\N
n17an3pzasuzakqa	n18ai-dy1sditid2j	5	\N	\N	\N
rmwvn2jti6p	n18ai-dy1sditid2j	4	\N	\N	\N
jqhsxkjhjqx	n18ai-dy1sditid2j	3	\N	\N	\N
5p1pe58rs68	n18ai-dy1sditid2j	2	\N	\N	\N
n18ai-dy1sditid2j	n18ai-dy1sditid2j	0	f	actions	\N
dy1sditid2j	n18ai-dy1sditid2j	1	\N	\N	2
n17t12fezb0kdm6	n18ai-fg8vgdeq8o9	8	\N	\N	\N
n17gpu69sz1v3x	n18ai-fg8vgdeq8o9	7	\N	\N	\N
n17tbmigqv76d79	n18ai-fg8vgdeq8o9	6	\N	\N	\N
n17anojyqup3vyyq	n18ai-fg8vgdeq8o9	5	\N	\N	\N
27uizyaoeom	n18ai-fg8vgdeq8o9	4	\N	\N	\N
g6ajx0tunfr	n18ai-fg8vgdeq8o9	3	\N	\N	\N
p4tfbl9ywsv	n18ai-fg8vgdeq8o9	2	\N	\N	\N
n18ai-fg8vgdeq8o9	n18ai-fg8vgdeq8o9	0	f	actions	\N
fg8vgdeq8o9	n18ai-fg8vgdeq8o9	1	\N	\N	2
n17tx4b835evqu	n18ai-s32m18vob1c	8	\N	\N	\N
n17g16z4mi0ul0l	n18ai-s32m18vob1c	7	\N	\N	\N
n17tbldvqz31qpl	n18ai-s32m18vob1c	6	\N	\N	\N
n17an3n7pyb0h14s	n18ai-s32m18vob1c	5	\N	\N	\N
u45ktzo11wr	n18ai-s32m18vob1c	4	\N	\N	\N
if5cnn4gway	n18ai-s32m18vob1c	3	\N	\N	\N
je1kdt8x04z	n18ai-s32m18vob1c	2	\N	\N	\N
n18ai-s32m18vob1c	n18ai-s32m18vob1c	0	f	actions	\N
s32m18vob1c	n18ai-s32m18vob1c	1	\N	\N	2
n17tkf0ipg15b6	n18ai-sy34mnly8c6	8	\N	\N	\N
n17gnxg1hj63t2	n18ai-sy34mnly8c6	7	\N	\N	\N
n17tbgrzqc88xbuu	n18ai-sy34mnly8c6	6	\N	\N	\N
n17anpa81ofl9ky	n18ai-sy34mnly8c6	5	\N	\N	\N
ii09dv79a3x	n18ai-sy34mnly8c6	4	\N	\N	\N
u2p6hsshmzu	n18ai-sy34mnly8c6	3	\N	\N	\N
1zx5qopep7e	n18ai-sy34mnly8c6	2	\N	\N	\N
n18ai-sy34mnly8c6	n18ai-sy34mnly8c6	0	f	actions	\N
sy34mnly8c6	n18ai-sy34mnly8c6	1	\N	\N	2
n17t2r7mq7n0zol	n18ai-ts03aroo4ah	8	\N	\N	\N
n17gk3c58z6a4np	n18ai-ts03aroo4ah	7	\N	\N	\N
n17tbc55f9eivj9	n18ai-ts03aroo4ah	6	\N	\N	\N
n17an3rxdfkv2dcg	n18ai-ts03aroo4ah	5	\N	\N	\N
pt0c8yc6aux	n18ai-ts03aroo4ah	4	\N	\N	\N
ozhtoox7sm4	n18ai-ts03aroo4ah	3	\N	\N	\N
bc8jfbp20jd	n18ai-ts03aroo4ah	2	\N	\N	\N
n18ai-ts03aroo4ah	n18ai-ts03aroo4ah	0	f	actions	\N
ts03aroo4ah	n18ai-ts03aroo4ah	1	\N	\N	2
n17tfyodvrkcq0d	n18ai-wqlv319eqdf	8	\N	\N	\N
n17gksef074rhx	n18ai-wqlv319eqdf	7	\N	\N	\N
n17tb34ir6hawk2h	n18ai-wqlv319eqdf	6	\N	\N	\N
n17an0vjd9gwrc3c	n18ai-wqlv319eqdf	5	\N	\N	\N
ecductxt41c	n18ai-wqlv319eqdf	4	\N	\N	\N
wnv9hj3i2cg	n18ai-wqlv319eqdf	3	\N	\N	\N
ie0pp6rvvhe	n18ai-wqlv319eqdf	2	\N	\N	\N
n18ai-wqlv319eqdf	n18ai-wqlv319eqdf	0	f	actions	\N
wqlv319eqdf	n18ai-wqlv319eqdf	1	\N	\N	2
\.


--
-- Data for Name: flowModels; Type: TABLE DATA; Schema: public; Owner: nocobase
--

COPY public."flowModels" (uid, name, options) FROM stdin;
79l2vf8w7cn	5x4jfp5mqyq	{"schema":{"use":"RouteModel"}}
ys3f98duku9	2axwbpsh56m	{"schema":{"use":"RouteModel"}}
agn3fjdakip	0ngl2psw3eb	{"schema":{"use":"RouteModel"}}
de09fofi09u	gvdvuxj24rb	{"schema":{"use":"RouteModel"}}
naprgm2jcj1	31pe35r4wjt	{"schema":{"use":"RouteModel"}}
zglcwwab145	zglcwwab145	{"schema":{"use":"RouteModel"}}
nt2ks1gajeg	0vtl5otkssk	{"schema":{"use":"RouteModel"}}
qfjd61d5wwj	qfjd61d5wwj	{"schema":{"use":"RouteModel"}}
uidcqvkwpu8	bj0q954bxnx	{"schema":{"use":"RouteModel"}}
rgfk9hxbfb9	4lar3enoww4	{"schema":{"use":"RouteModel"}}
nnfjnjretaw	e7y7cdrhvn8	{"schema":{"use":"RouteModel"}}
gt5oag9v76g	d8atyjxmqjo	{"schema":{"use":"RouteModel"}}
hkr6nvogp0g	hkr6nvogp0g	{"schema":{"use":"RouteModel"}}
k8cadv7w2oa	4c6evy3l51u	{"schema":{"use":"RouteModel"}}
75kqrkvy7gh	75kqrkvy7gh	{"schema":{"use":"RouteModel"}}
074p44nxv9i	197vte5frbh	{"schema":{"use":"RouteModel"}}
hhozqul2o6x	hhozqul2o6x	{"schema":{"use":"RouteModel"}}
0ii7sfdw3fk	q5wziinby8l	{"schema":{"use":"RouteModel"}}
o8u7f1fk903	o8u7f1fk903	{"schema":{"use":"RouteModel"}}
r10klohrj5v	8bvzdprysvf	{"schema":{"use":"RouteModel"}}
zcbvtstmsld	zyospjy9bap	{"schema":{"use":"RouteModel"}}
i67j5504egp	i67j5504egp	{"schema":{"use":"RouteModel"}}
0pt58xonjng	y6vt72gv8i1	{"schema":{"use":"RouteModel"}}
4ahv5yplz0s	4ahv5yplz0s	{"schema":{"use":"RouteModel"}}
uk5clh3liq9	x42i06rpb3s	{"schema":{"use":"RouteModel"}}
nakpzj93jzf	nakpzj93jzf	{"schema":{"use":"RouteModel"}}
mxbhnn483m8	pnrf9jwi5iy	{"schema":{"use":"RouteModel"}}
aoxrvu5pb5i	aoxrvu5pb5i	{"schema":{"use":"RouteModel"}}
a7niunhson7	gzfcj42emoj	{"schema":{"use":"RouteModel"}}
fkmy4jf6x5t	fkmy4jf6x5t	{"schema":{"use":"RouteModel"}}
h7yfvpwrs6t	hfjjwy56xxk	{"schema":{"use":"RouteModel"}}
wbi7nu9o7iy	wbi7nu9o7iy	{"schema":{"use":"RouteModel"}}
1jcx1bhpfcq	kmbs4ci0y4h	{"schema":{"use":"RouteModel"}}
olomq09w89x	11vznamlfni	{"schema":{"use":"RouteModel"}}
rtcza5qp46f	krpll9gknz5	{"schema":{"use":"RouteModel"}}
9amd91p9pjk	9amd91p9pjk	{"schema":{"use":"RouteModel"}}
gyxgwl9j2cp	qct9uevsdtx	{"schema":{"use":"RouteModel"}}
zv7s6g4hzb1	6wdmutrl1q8	{"schema":{"use":"RouteModel"}}
d7v3y1zq1g8	ni28h5jzx4o	{"schema":{"use":"RouteModel"}}
6f098vpu2ja	6f098vpu2ja	{"schema":{"use":"RouteModel"}}
czcci0i6aaj	9kn4xuljba4	{"schema":{"use":"RouteModel"}}
m4az3j2q86f	m4az3j2q86f	{"schema":{"use":"RouteModel"}}
4tynw4yhq5f	fezidbk6m9k	{"schema":{"use":"RouteModel"}}
3z6u4oy872l	qtai0gmggcd	{"schema":{"use":"RouteModel"}}
xfvfl0w0uy7	axwselg2saf	{"schema":{"use":"RouteModel"}}
dq3l8m8yhsc	dq3l8m8yhsc	{"schema":{"use":"RouteModel"}}
q3psk92yw3m	ea394slfgox	{"schema":{"use":"RouteModel"}}
2am6xd3zbmi	2am6xd3zbmi	{"schema":{"use":"RouteModel"}}
z66lx5fi6lh	5tizzz62cwm	{"schema":{"use":"RouteModel"}}
p5yz5fbsl20	ewbmrfdc703	{"schema":{"use":"RouteModel"}}
1ecrb76t6dk	1ecrb76t6dk	{"schema":{"use":"RouteModel"}}
n13ai2efgqippp44	n13ai2efgqippp44	{"schema":{"use":"RouteModel"}}
n13tabhk9bxduic2q	n13tabhk9bxduic2q	{"schema":{"use":"RouteModel"}}
n13pgn06i47yw6k	n13pgn06i47yw6k	{"parentId":"n13ai2efgqippp44","subKey":"page","subType":"object","use":"RootPageModel"}
n13gr4jc953f732j	n13gr4jc953f732j	{"parentId":"n13tabhk9bxduic2q","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n13cbpuliis0kqee	n13cbpuliis0kqee	{"use":"AIChatBoxBlockModel","parentId":"n13gr4jc953f732j","subKey":"items","subType":"array","sortIndex":1,"props":{"minWidth":400,"height":650,"scope":"n13cbpuliis0kqee","systemPrompt":"","defaultUserMessage":"","workContext":[],"allowedAIEmployees":[],"allowedModels":[],"senderPlaceholder":"Enter your question","showMessages":true,"showContextSelector":true,"showUpload":true,"showWebSearch":true,"showEmployeeSelect":true,"showModelSelect":true,"showDisclaimer":true}}
n13cc862fs6ew4ds	n13cc862fs6ew4ds	{"use":"AIChatBoxCoreModel","parentId":"n13cbpuliis0kqee","subKey":"items","subType":"array","props":{}}
n13tbqbw50631n7n	n13tbqbw50631n7n	{"use":"TableBlockModel","parentId":"n13gr4jc953f732j","subKey":"items","subType":"array","sortIndex":2,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets"}}},"props":{}}
n13wkt	n13wkt	{"use":"TableColumnModel","parentId":"n13tbqbw50631n7n","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"title"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"工单标题","dataIndex":"title","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n13wktf	n13wktf	{"use":"DisplayTextFieldModel","parentId":"n13wkt","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17sys042q2lz	n17sys042q2lz	{"schema":{"use":"RouteModel"}}
n17tnmwqho6hgl	n17tnmwqho6hgl	{"schema":{"use":"RouteModel"}}
n17parciev0wgwh	n17parciev0wgwh	{"parentId":"n17sys042q2lz","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"客户","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"客户","displayTitle":true,"enableTabs":false}}}}
n17gvcpaqeznhk	n17gvcpaqeznhk	{"parentId":"n17tnmwqho6hgl","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17gpu69sz1v3x	n17gpu69sz1v3x	{"parentId":"n17t12fezb0kdm6","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n13wks	n13wks	{"use":"TableColumnModel","parentId":"n13tbqbw50631n7n","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"new","label":"新建","color":"default"},{"value":"assigned","label":"已指派","color":"blue"},{"value":"waiting_customer","label":"待客户","color":"orange"},{"value":"waiting_internal","label":"待内部","color":"purple"},{"value":"in_progress","label":"处理中","color":"cyan"},{"value":"resolved","label":"已解决","color":"green"},{"value":"closed","label":"已关闭","color":"default"},{"value":"reopened","label":"重开","color":"red"}]}}
n13wksf	n13wksf	{"use":"DisplayEnumFieldModel","parentId":"n13wks","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"new","label":"新建","color":"default"},{"value":"assigned","label":"已指派","color":"blue"},{"value":"waiting_customer","label":"待客户","color":"orange"},{"value":"waiting_internal","label":"待内部","color":"purple"},{"value":"in_progress","label":"处理中","color":"cyan"},{"value":"resolved","label":"已解决","color":"green"},{"value":"closed","label":"已关闭","color":"default"},{"value":"reopened","label":"重开","color":"red"}]}}
n13wkp	n13wkp	{"use":"TableColumnModel","parentId":"n13tbqbw50631n7n","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"priority"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"优先级","dataIndex":"priority","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"low","label":"低","color":"default"},{"value":"medium","label":"中","color":"blue"},{"value":"high","label":"高","color":"orange"},{"value":"urgent","label":"紧急","color":"red"}]}}
n13wkpf	n13wkpf	{"use":"DisplayEnumFieldModel","parentId":"n13wkp","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"low","label":"低","color":"default"},{"value":"medium","label":"中","color":"blue"},{"value":"high","label":"高","color":"orange"},{"value":"urgent","label":"紧急","color":"red"}]}}
n17tbgfz3oq90r98	n17tbgfz3oq90r98	{"use":"TableBlockModel","parentId":"n17gvcpaqeznhk","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers"}}},"props":{}}
n17cp7hibgml8mm	n17cp7hibgml8mm	{"use":"TableColumnModel","parentId":"n17tbgfz3oq90r98","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"name"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"客户名称","dataIndex":"name","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cp7hibgml8mmf	n17cp7hibgml8mmf	{"use":"DisplayTextFieldModel","parentId":"n17cp7hibgml8mm","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cqmq4hqagsbr	n17cqmq4hqagsbr	{"use":"TableColumnModel","parentId":"n17tbgfz3oq90r98","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"type"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"类型","dataIndex":"type","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"enterprise","label":"企业客户","color":"blue"},{"value":"trader","label":"贸易商","color":"cyan"},{"value":"factory","label":"工厂","color":"green"}]}}
n17cqmq4hqagsbrf	n17cqmq4hqagsbrf	{"use":"DisplayEnumFieldModel","parentId":"n17cqmq4hqagsbr","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"enterprise","label":"企业客户","color":"blue"},{"value":"trader","label":"贸易商","color":"cyan"},{"value":"factory","label":"工厂","color":"green"}]}}
n17cfoiw9at9rz	n17cfoiw9at9rz	{"use":"TableColumnModel","parentId":"n17tbgfz3oq90r98","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"industry"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"行业","dataIndex":"industry","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cfoiw9at9rzf	n17cfoiw9at9rzf	{"use":"DisplayTextFieldModel","parentId":"n17cfoiw9at9rz","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cg4jvxo0ldnp	n17cg4jvxo0ldnp	{"use":"TableColumnModel","parentId":"n17tbgfz3oq90r98","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"country"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"国家/地区","dataIndex":"country","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cg4jvxo0ldnpf	n17cg4jvxo0ldnpf	{"use":"DisplayTextFieldModel","parentId":"n17cg4jvxo0ldnp","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17c15fez1adt8j	n17c15fez1adt8j	{"use":"TableColumnModel","parentId":"n17tbgfz3oq90r98","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"level"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"等级","dataIndex":"level","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"A","label":"A 级","color":"green"},{"value":"B","label":"B 级","color":"blue"},{"value":"C","label":"C 级","color":"orange"}]}}
n17c15fez1adt8jf	n17c15fez1adt8jf	{"use":"DisplayEnumFieldModel","parentId":"n17c15fez1adt8j","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"A","label":"A 级","color":"green"},{"value":"B","label":"B 级","color":"blue"},{"value":"C","label":"C 级","color":"orange"}]}}
n17cuh5soevyzef	n17cuh5soevyzef	{"use":"TableColumnModel","parentId":"n17tbgfz3oq90r98","subKey":"columns","subType":"array","sortIndex":6,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"active","label":"合作中","color":"green"},{"value":"prospect","label":"潜在","color":"blue"},{"value":"churned","label":"已流失","color":"red"}]}}
n17cuh5soevyzeff	n17cuh5soevyzeff	{"use":"DisplayEnumFieldModel","parentId":"n17cuh5soevyzef","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"active","label":"合作中","color":"green"},{"value":"prospect","label":"潜在","color":"blue"},{"value":"churned","label":"已流失","color":"red"}]}}
n17an3pzasuzakqa	n17an3pzasuzakqa	{"parentId":"n17tbgfz3oq90r98","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_customers","dataSourceKey":"main"}}}}
rmwvn2jti6p	rmwvn2jti6p	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
jqhsxkjhjqx	jqhsxkjhjqx	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
5p1pe58rs68	5p1pe58rs68	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
dy1sditid2j	dy1sditid2j	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers"}}}}
n17tbmigqv76d79	n17tbmigqv76d79	{"use":"TableBlockModel","parentId":"n17gpu69sz1v3x","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts"}}},"props":{}}
n17i22klkfiqzyz	n17i22klkfiqzyz	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"phone"}}}}
3q53gu9khsl	3q53gu9khsl	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17i7p67xwukfto"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17ikzxfi9tqsy"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17ir5aq0raikt"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17iwo5cr8y02ac"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17ilb01hvf5hk"]}],"sizes":[24]},{"id":"r5","cells":[{"id":"r5:cell:0","items":["n17iseoq8ddcjqe"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3","r4","r5"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17i7p67xwukfto"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17ikzxfi9tqsy"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17ir5aq0raikt"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17iwo5cr8y02ac"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17ilb01hvf5hk"]}],"sizes":[24]},{"id":"r5","cells":[{"id":"r5:cell:0","items":["n17iseoq8ddcjqe"]}],"sizes":[24]}]}}}}}
n17i7p67xwukfto	n17i7p67xwukfto	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"name"}}}}
tolll70hteh	tolll70hteh	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17ikzxfi9tqsy	n17ikzxfi9tqsy	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"type"}}}}
mcz4f4010io	mcz4f4010io	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"enterprise","label":"企业客户","color":"blue"},{"value":"trader","label":"贸易商","color":"cyan"},{"value":"factory","label":"工厂","color":"green"}]}}
n17ir5aq0raikt	n17ir5aq0raikt	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"industry"}}}}
p254h0rrah3	p254h0rrah3	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17iwo5cr8y02ac	n17iwo5cr8y02ac	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"country"}}}}
coo6zw29rq8	coo6zw29rq8	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17ilb01hvf5hk	n17ilb01hvf5hk	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":5,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"level"}}}}
baugmttob2e	baugmttob2e	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"A","label":"A 级","color":"green"},{"value":"B","label":"B 级","color":"blue"},{"value":"C","label":"C 级","color":"orange"}]}}
n17iseoq8ddcjqe	n17iseoq8ddcjqe	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":6,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_customers","fieldPath":"status"}}}}
cf503q32l9j	cf503q32l9j	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"active","label":"合作中","color":"green"},{"value":"prospect","label":"潜在","color":"blue"},{"value":"churned","label":"已流失","color":"red"}]}}
n17rfzb9nkudga3k	n17rfzb9nkudga3k	{"parentId":"n17tbgfz3oq90r98","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17rwc527ujwt	n17rwc527ujwt	{"schema":{"use":"RouteModel"}}
n17tfyodvrkcq0d	n17tfyodvrkcq0d	{"schema":{"use":"RouteModel"}}
n17p0iib10y1e9x	n17p0iib10y1e9x	{"parentId":"n17rwc527ujwt","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"销售线索","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"销售线索","displayTitle":true,"enableTabs":false}}}}
n17gksef074rhx	n17gksef074rhx	{"parentId":"n17tfyodvrkcq0d","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17tb34ir6hawk2h	n17tb34ir6hawk2h	{"use":"TableBlockModel","parentId":"n17gksef074rhx","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads"}}},"props":{}}
n17cyw3hdcdo98s	n17cyw3hdcdo98s	{"use":"TableColumnModel","parentId":"n17tb34ir6hawk2h","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"name"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"线索名称","dataIndex":"name","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cyw3hdcdo98sf	n17cyw3hdcdo98sf	{"use":"DisplayTextFieldModel","parentId":"n17cyw3hdcdo98s","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_leads","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cst2yk5l3n5	n17cst2yk5l3n5	{"use":"TableColumnModel","parentId":"n17tb34ir6hawk2h","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"company"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"公司","dataIndex":"company","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cst2yk5l3n5f	n17cst2yk5l3n5f	{"use":"DisplayTextFieldModel","parentId":"n17cst2yk5l3n5","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_leads","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cdnpflwji8w4	n17cdnpflwji8w4	{"use":"TableColumnModel","parentId":"n17tb34ir6hawk2h","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"stage"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"阶段","dataIndex":"stage","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"new","label":"新线索","color":"default"},{"value":"contacted","label":"已联系","color":"blue"},{"value":"requirements_confirmed","label":"需求确认","color":"cyan"},{"value":"proposal","label":"方案报价","color":"purple"},{"value":"negotiation","label":"商务谈判","color":"orange"},{"value":"won","label":"赢单","color":"green"},{"value":"lost","label":"输单","color":"red"}]}}
n17cdnpflwji8w4f	n17cdnpflwji8w4f	{"use":"DisplayEnumFieldModel","parentId":"n17cdnpflwji8w4","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_leads","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"new","label":"新线索","color":"default"},{"value":"contacted","label":"已联系","color":"blue"},{"value":"requirements_confirmed","label":"需求确认","color":"cyan"},{"value":"proposal","label":"方案报价","color":"purple"},{"value":"negotiation","label":"商务谈判","color":"orange"},{"value":"won","label":"赢单","color":"green"},{"value":"lost","label":"输单","color":"red"}]}}
n17cqlea2exr3e	n17cqlea2exr3e	{"use":"TableColumnModel","parentId":"n17tb34ir6hawk2h","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"owner"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"负责人","dataIndex":"owner","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cqlea2exr3ef	n17cqlea2exr3ef	{"use":"DisplayTextFieldModel","parentId":"n17cqlea2exr3e","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_leads","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cf4njh9jtlt	n17cf4njh9jtlt	{"use":"TableColumnModel","parentId":"n17tb34ir6hawk2h","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"expected_amount"}},"tableColumnSettings":{"model":{"use":"DisplayNumberFieldModel"}}},"props":{"title":"预计金额","dataIndex":"expected_amount","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cf4njh9jtltf	n17cf4njh9jtltf	{"use":"DisplayNumberFieldModel","parentId":"n17cf4njh9jtlt","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_leads","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17an0vjd9gwrc3c	n17an0vjd9gwrc3c	{"parentId":"n17tb34ir6hawk2h","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_leads","dataSourceKey":"main"}}}}
ecductxt41c	ecductxt41c	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
wnv9hj3i2cg	wnv9hj3i2cg	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
ie0pp6rvvhe	ie0pp6rvvhe	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
wqlv319eqdf	wqlv319eqdf	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads"}}}}
7w13qv5b5lj	7w13qv5b5lj	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ikhplbvkckw9"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17i7jgrjachz6g"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17i374gtib87yv"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17ijka1snzwsw"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17i5qwozgzw89a"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3","r4"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ikhplbvkckw9"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17i7jgrjachz6g"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17i374gtib87yv"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17ijka1snzwsw"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17i5qwozgzw89a"]}],"sizes":[24]}]}}}}}
n17ikhplbvkckw9	n17ikhplbvkckw9	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"name"}}}}
9ql5y7e1f6x	9ql5y7e1f6x	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i7jgrjachz6g	n17i7jgrjachz6g	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"company"}}}}
zy418y99a9r	zy418y99a9r	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i374gtib87yv	n17i374gtib87yv	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"stage"}}}}
m77ldhli8in	m77ldhli8in	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"new","label":"新线索","color":"default"},{"value":"contacted","label":"已联系","color":"blue"},{"value":"requirements_confirmed","label":"需求确认","color":"cyan"},{"value":"proposal","label":"方案报价","color":"purple"},{"value":"negotiation","label":"商务谈判","color":"orange"},{"value":"won","label":"赢单","color":"green"},{"value":"lost","label":"输单","color":"red"}]}}
n17ijka1snzwsw	n17ijka1snzwsw	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"owner"}}}}
ugdudmtvu8w	ugdudmtvu8w	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i5qwozgzw89a	n17i5qwozgzw89a	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":5,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_leads","fieldPath":"expected_amount"}}}}
jm2wpw9rkpc	jm2wpw9rkpc	{"use":"NumberFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17rfcow28twku0u	n17rfcow28twku0u	{"parentId":"n17tb34ir6hawk2h","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17c3lkyg9zjd6	n17c3lkyg9zjd6	{"schema":{"use":"RouteModel"}}
n17t12fezb0kdm6	n17t12fezb0kdm6	{"schema":{"use":"RouteModel"}}
n17pz2elarbkyyd	n17pz2elarbkyyd	{"parentId":"n17c3lkyg9zjd6","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"联系人","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"联系人","displayTitle":true,"enableTabs":false}}}}
n17czzazkdl004	n17czzazkdl004	{"use":"TableColumnModel","parentId":"n17tbmigqv76d79","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"full_name"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"姓名","dataIndex":"full_name","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17czzazkdl004f	n17czzazkdl004f	{"use":"DisplayTextFieldModel","parentId":"n17czzazkdl004","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_contacts","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17c8qxat7jzuzf	n17c8qxat7jzuzf	{"use":"TableColumnModel","parentId":"n17tbmigqv76d79","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"job_title"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"职务","dataIndex":"job_title","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c8qxat7jzuzff	n17c8qxat7jzuzff	{"use":"DisplayTextFieldModel","parentId":"n17c8qxat7jzuzf","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_contacts","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cgf4bsr5wxx5	n17cgf4bsr5wxx5	{"use":"TableColumnModel","parentId":"n17tbmigqv76d79","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"email"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"邮箱","dataIndex":"email","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cgf4bsr5wxx5f	n17cgf4bsr5wxx5f	{"use":"DisplayTextFieldModel","parentId":"n17cgf4bsr5wxx5","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_contacts","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17calpuywt301h	n17calpuywt301h	{"use":"TableColumnModel","parentId":"n17tbmigqv76d79","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"phone"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"电话","dataIndex":"phone","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17calpuywt301hf	n17calpuywt301hf	{"use":"DisplayTextFieldModel","parentId":"n17calpuywt301h","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_contacts","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17ca5rs5hqus56	n17ca5rs5hqus56	{"use":"TableColumnModel","parentId":"n17tbmigqv76d79","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"active","label":"在职","color":"green"},{"value":"inactive","label":"离职","color":"default"}]}}
n17ca5rs5hqus56f	n17ca5rs5hqus56f	{"use":"DisplayEnumFieldModel","parentId":"n17ca5rs5hqus56","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_contacts","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"active","label":"在职","color":"green"},{"value":"inactive","label":"离职","color":"default"}]}}
n17anojyqup3vyyq	n17anojyqup3vyyq	{"parentId":"n17tbmigqv76d79","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_contacts","dataSourceKey":"main"}}}}
27uizyaoeom	27uizyaoeom	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
g6ajx0tunfr	g6ajx0tunfr	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
p4tfbl9ywsv	p4tfbl9ywsv	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
fg8vgdeq8o9	fg8vgdeq8o9	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts"}}}}
en6fa4qktml	en6fa4qktml	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ipqhsy3s7xu"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17is1om22hvhm"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17i3jqiec2gsxm"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17i22klkfiqzyz"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17i04m3k8zyjbw"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3","r4"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ipqhsy3s7xu"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17is1om22hvhm"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17i3jqiec2gsxm"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17i22klkfiqzyz"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17i04m3k8zyjbw"]}],"sizes":[24]}]}}}}}
n17ipqhsy3s7xu	n17ipqhsy3s7xu	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"full_name"}}}}
xlbomh9fzec	xlbomh9fzec	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17is1om22hvhm	n17is1om22hvhm	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"job_title"}}}}
amy4hny41p8	amy4hny41p8	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i3jqiec2gsxm	n17i3jqiec2gsxm	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"email"}}}}
zr5ah1ajgnu	zr5ah1ajgnu	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
rxd0mu1he78	rxd0mu1he78	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i04m3k8zyjbw	n17i04m3k8zyjbw	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":5,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_contacts","fieldPath":"status"}}}}
axc6i7qm6ku	axc6i7qm6ku	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"active","label":"在职","color":"green"},{"value":"inactive","label":"离职","color":"default"}]}}
n17rf8lptk9b02lt	n17rf8lptk9b02lt	{"parentId":"n17tbmigqv76d79","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17vu68623sj9i	n17vu68623sj9i	{"schema":{"use":"RouteModel"}}
n17tfgec1j85e5d	n17tfgec1j85e5d	{"schema":{"use":"RouteModel"}}
n17puy9spjgow2t	n17puy9spjgow2t	{"parentId":"n17vu68623sj9i","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"订单","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"订单","displayTitle":true,"enableTabs":false}}}}
n17gzmr0v7w14r	n17gzmr0v7w14r	{"parentId":"n17tfgec1j85e5d","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17tbe5sj8dsvieh	n17tbe5sj8dsvieh	{"use":"TableBlockModel","parentId":"n17gzmr0v7w14r","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals"}}},"props":{}}
n17c9ka40nvuo7	n17c9ka40nvuo7	{"use":"TableColumnModel","parentId":"n17tbe5sj8dsvieh","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"name"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"订单名称","dataIndex":"name","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c9ka40nvuo7f	n17c9ka40nvuo7f	{"use":"DisplayTextFieldModel","parentId":"n17c9ka40nvuo7","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_deals","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17c7l14ppxulb5	n17c7l14ppxulb5	{"use":"TableColumnModel","parentId":"n17tbe5sj8dsvieh","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"deadline"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"交付截止","dataIndex":"deadline","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c7l14ppxulb5f	n17c7l14ppxulb5f	{"use":"DisplayTextFieldModel","parentId":"n17c7l14ppxulb5","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_deals","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cgdont7c8m6s	n17cgdont7c8m6s	{"use":"TableColumnModel","parentId":"n17tbe5sj8dsvieh","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"amount"}},"tableColumnSettings":{"model":{"use":"DisplayNumberFieldModel"}}},"props":{"title":"金额","dataIndex":"amount","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cgdont7c8m6sf	n17cgdont7c8m6sf	{"use":"DisplayNumberFieldModel","parentId":"n17cgdont7c8m6s","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_deals","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cooj7zv8zzmd	n17cooj7zv8zzmd	{"use":"TableColumnModel","parentId":"n17tbe5sj8dsvieh","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"pending","label":"处理中","color":"blue"},{"value":"fulfilled","label":"已交付","color":"green"},{"value":"cancelled","label":"已取消","color":"red"}]}}
n17cooj7zv8zzmdf	n17cooj7zv8zzmdf	{"use":"DisplayEnumFieldModel","parentId":"n17cooj7zv8zzmd","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_deals","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"pending","label":"处理中","color":"blue"},{"value":"fulfilled","label":"已交付","color":"green"},{"value":"cancelled","label":"已取消","color":"red"}]}}
n17cq8mdgf7mfd	n17cq8mdgf7mfd	{"use":"TableColumnModel","parentId":"n17tbe5sj8dsvieh","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"owner"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"负责人","dataIndex":"owner","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cq8mdgf7mfdf	n17cq8mdgf7mfdf	{"use":"DisplayTextFieldModel","parentId":"n17cq8mdgf7mfd","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_deals","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17angirk9efi9st	n17angirk9efi9st	{"parentId":"n17tbe5sj8dsvieh","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_deals","dataSourceKey":"main"}}}}
ah559fbkpwr	ah559fbkpwr	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
0cwxawsd75b	0cwxawsd75b	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
jgpe2vqzhh3	jgpe2vqzhh3	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
96vmjc93frt	96vmjc93frt	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals"}}}}
7p2ut7naxhy	7p2ut7naxhy	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"low","label":"低","color":"default"},{"value":"medium","label":"中","color":"blue"},{"value":"high","label":"高","color":"orange"},{"value":"urgent","label":"紧急","color":"red"}]}}
s32m18vob1c	s32m18vob1c	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets"}}}}
og3b30jbrl0	og3b30jbrl0	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17i85jx35ct5hj"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17i0pgh9pn9sdr"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17ip21juq9fkjh"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17icju58zqbj6b"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17i85jx35ct5hj"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17i0pgh9pn9sdr"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17ip21juq9fkjh"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17icju58zqbj6b"]}],"sizes":[24]}]}}}}}
n17i85jx35ct5hj	n17i85jx35ct5hj	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"name"}}}}
ebf5ligo2lu	ebf5ligo2lu	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i0pgh9pn9sdr	n17i0pgh9pn9sdr	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"amount"}}}}
rc4qi8o11zt	rc4qi8o11zt	{"use":"NumberFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17ip21juq9fkjh	n17ip21juq9fkjh	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"status"}}}}
vyp02usbjl6	vyp02usbjl6	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"pending","label":"处理中","color":"blue"},{"value":"fulfilled","label":"已交付","color":"green"},{"value":"cancelled","label":"已取消","color":"red"}]}}
n17icju58zqbj6b	n17icju58zqbj6b	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_deals","fieldPath":"owner"}}}}
o71eceys0ib	o71eceys0ib	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17rfveae7rthhfg	n17rfveae7rthhfg	{"parentId":"n17tbe5sj8dsvieh","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17v6xfvzxoj0f	n17v6xfvzxoj0f	{"schema":{"use":"RouteModel"}}
n17tkf0ipg15b6	n17tkf0ipg15b6	{"schema":{"use":"RouteModel"}}
n17pj5ccw34hcm8	n17pj5ccw34hcm8	{"parentId":"n17v6xfvzxoj0f","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"报价单","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"报价单","displayTitle":true,"enableTabs":false}}}}
n17gnxg1hj63t2	n17gnxg1hj63t2	{"parentId":"n17tkf0ipg15b6","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17tbgrzqc88xbuu	n17tbgrzqc88xbuu	{"use":"TableBlockModel","parentId":"n17gnxg1hj63t2","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes"}}},"props":{}}
n17cbn0m01ldr5w	n17cbn0m01ldr5w	{"use":"TableColumnModel","parentId":"n17tbgrzqc88xbuu","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"quote_no"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"报价编号","dataIndex":"quote_no","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cbn0m01ldr5wf	n17cbn0m01ldr5wf	{"use":"DisplayTextFieldModel","parentId":"n17cbn0m01ldr5w","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_quotes","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cwwn5l70knv	n17cwwn5l70knv	{"use":"TableColumnModel","parentId":"n17tbgrzqc88xbuu","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"valid_until"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"有效期至","dataIndex":"valid_until","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cwwn5l70knvf	n17cwwn5l70knvf	{"use":"DisplayTextFieldModel","parentId":"n17cwwn5l70knv","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_quotes","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cxvrk0srw0d	n17cxvrk0srw0d	{"use":"TableColumnModel","parentId":"n17tbgrzqc88xbuu","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"total_amount"}},"tableColumnSettings":{"model":{"use":"DisplayNumberFieldModel"}}},"props":{"title":"总金额","dataIndex":"total_amount","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cxvrk0srw0df	n17cxvrk0srw0df	{"use":"DisplayNumberFieldModel","parentId":"n17cxvrk0srw0d","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_quotes","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cneqrt5bcl	n17cneqrt5bcl	{"use":"TableColumnModel","parentId":"n17tbgrzqc88xbuu","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"draft","label":"草稿","color":"default"},{"value":"sent","label":"已发送","color":"blue"},{"value":"accepted","label":"已接受","color":"green"},{"value":"converted","label":"已转订单","color":"purple"},{"value":"void","label":"已作废","color":"default"},{"value":"rejected","label":"已拒绝","color":"red"},{"value":"pending_approval","label":"待审批","color":"orange"}]}}
n17i2tid9ghh976	n17i2tid9ghh976	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"customer"}}}}
uv5mklmerm3	uv5mklmerm3	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
nk75hjjv28u	nk75hjjv28u	{"schema":{"use":"RouteModel"}}
n17cneqrt5bclf	n17cneqrt5bclf	{"use":"DisplayEnumFieldModel","parentId":"n17cneqrt5bcl","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_quotes","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"draft","label":"草稿","color":"default"},{"value":"sent","label":"已发送","color":"blue"},{"value":"accepted","label":"已接受","color":"green"},{"value":"converted","label":"已转订单","color":"purple"},{"value":"void","label":"已作废","color":"default"},{"value":"rejected","label":"已拒绝","color":"red"},{"value":"pending_approval","label":"待审批","color":"orange"}]}}
n17anpa81ofl9ky	n17anpa81ofl9ky	{"parentId":"n17tbgrzqc88xbuu","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"crm_quotes","dataSourceKey":"main"}}}}
ii09dv79a3x	ii09dv79a3x	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
u2p6hsshmzu	u2p6hsshmzu	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
1zx5qopep7e	1zx5qopep7e	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
sy34mnly8c6	sy34mnly8c6	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes"}}}}
y80aro3on81	y80aro3on81	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17i59je3bfay0h"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17izjg2hhql6oj"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17iowayu385jjs"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17i59je3bfay0h"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17izjg2hhql6oj"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17iowayu385jjs"]}],"sizes":[24]}]}}}}}
n17i59je3bfay0h	n17i59je3bfay0h	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"quote_no"}}}}
ey8ac5j0t0b	ey8ac5j0t0b	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17izjg2hhql6oj	n17izjg2hhql6oj	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"total_amount"}}}}
v5vw360ezm3	v5vw360ezm3	{"use":"NumberFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17iowayu385jjs	n17iowayu385jjs	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"crm_quotes","fieldPath":"status"}}}}
cm8c1ywagst	cm8c1ywagst	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"draft","label":"草稿","color":"default"},{"value":"sent","label":"已发送","color":"blue"},{"value":"accepted","label":"已接受","color":"green"},{"value":"converted","label":"已转订单","color":"purple"},{"value":"void","label":"已作废","color":"default"},{"value":"rejected","label":"已拒绝","color":"red"},{"value":"pending_approval","label":"待审批","color":"orange"}]}}
n17rfrt1gr7nmeqd	n17rfrt1gr7nmeqd	{"parentId":"n17tbgrzqc88xbuu","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17etqhllqqa28	n17etqhllqqa28	{"schema":{"use":"RouteModel"}}
n17tgpj7uku1rcb	n17tgpj7uku1rcb	{"schema":{"use":"RouteModel"}}
n17psm1qx85l6c	n17psm1qx85l6c	{"parentId":"n17etqhllqqa28","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"工单","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"工单","displayTitle":true,"enableTabs":false}}}}
n17gqxvb782dhm	n17gqxvb782dhm	{"parentId":"n17tgpj7uku1rcb","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17tbcdlj6fd8nd	n17tbcdlj6fd8nd	{"use":"TableBlockModel","parentId":"n17gqxvb782dhm","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets"}}},"props":{}}
n17c4mddjna8g7s	n17c4mddjna8g7s	{"use":"TableColumnModel","parentId":"n17tbcdlj6fd8nd","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"title"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"工单标题","dataIndex":"title","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c4mddjna8g7sf	n17c4mddjna8g7sf	{"use":"DisplayTextFieldModel","parentId":"n17c4mddjna8g7s","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cgi0y45zx2tf	n17cgi0y45zx2tf	{"use":"TableColumnModel","parentId":"n17tbcdlj6fd8nd","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"new","label":"新建","color":"default"},{"value":"assigned","label":"已指派","color":"blue"},{"value":"waiting_customer","label":"待客户","color":"orange"},{"value":"waiting_internal","label":"待内部","color":"purple"},{"value":"in_progress","label":"处理中","color":"cyan"},{"value":"resolved","label":"已解决","color":"green"},{"value":"closed","label":"已关闭","color":"default"},{"value":"reopened","label":"重开","color":"red"}]}}
n17iu42tf4qfr1	n17iu42tf4qfr1	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"category"}}}}
ke2i1ila49c	ke2i1ila49c	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17itmmnxopj52m	n17itmmnxopj52m	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":5,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"assignee"}}}}
n17cgi0y45zx2tff	n17cgi0y45zx2tff	{"use":"DisplayEnumFieldModel","parentId":"n17cgi0y45zx2tf","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"new","label":"新建","color":"default"},{"value":"assigned","label":"已指派","color":"blue"},{"value":"waiting_customer","label":"待客户","color":"orange"},{"value":"waiting_internal","label":"待内部","color":"purple"},{"value":"in_progress","label":"处理中","color":"cyan"},{"value":"resolved","label":"已解决","color":"green"},{"value":"closed","label":"已关闭","color":"default"},{"value":"reopened","label":"重开","color":"red"}]}}
n17cp1r83qbid7g	n17cp1r83qbid7g	{"use":"TableColumnModel","parentId":"n17tbcdlj6fd8nd","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"priority"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"优先级","dataIndex":"priority","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"low","label":"低","color":"default"},{"value":"medium","label":"中","color":"blue"},{"value":"high","label":"高","color":"orange"},{"value":"urgent","label":"紧急","color":"red"}]}}
n17cp1r83qbid7gf	n17cp1r83qbid7gf	{"use":"DisplayEnumFieldModel","parentId":"n17cp1r83qbid7g","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"low","label":"低","color":"default"},{"value":"medium","label":"中","color":"blue"},{"value":"high","label":"高","color":"orange"},{"value":"urgent","label":"紧急","color":"red"}]}}
n17c9or5abfvfv	n17c9or5abfvfv	{"use":"TableColumnModel","parentId":"n17tbcdlj6fd8nd","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"customer"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"客户","dataIndex":"customer","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c9or5abfvfvf	n17c9or5abfvfvf	{"use":"DisplayTextFieldModel","parentId":"n17c9or5abfvfv","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17c2tv9oj5w3t	n17c2tv9oj5w3t	{"use":"TableColumnModel","parentId":"n17tbcdlj6fd8nd","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"category"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"类别","dataIndex":"category","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c2tv9oj5w3tf	n17c2tv9oj5w3tf	{"use":"DisplayTextFieldModel","parentId":"n17c2tv9oj5w3t","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17ctxqc1xyt2x	n17ctxqc1xyt2x	{"use":"TableColumnModel","parentId":"n17tbcdlj6fd8nd","subKey":"columns","subType":"array","sortIndex":6,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"assignee"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"处理人","dataIndex":"assignee","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17ctxqc1xyt2xf	n17ctxqc1xyt2xf	{"use":"DisplayTextFieldModel","parentId":"n17ctxqc1xyt2x","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17anciuiqjj5z	n17anciuiqjj5z	{"parentId":"n17tbcdlj6fd8nd","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_tk_tickets","dataSourceKey":"main"}}}}
kbat1zt768b	kbat1zt768b	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
otq0qlkbq1e	otq0qlkbq1e	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
j2xilg2fkfc	j2xilg2fkfc	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
cyezqctu98x	cyezqctu98x	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets"}}}}
wx7qxj8vvq6	wx7qxj8vvq6	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17iabx2zxkxb68"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17i7bsl8233z49"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17i2tid9ghh976"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17iu42tf4qfr1"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17itmmnxopj52m"]}],"sizes":[24]},{"id":"r5","cells":[{"id":"r5:cell:0","items":["n17iwmyinli3rgl"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3","r4","r5"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17iabx2zxkxb68"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17i7bsl8233z49"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17i2tid9ghh976"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17iu42tf4qfr1"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17itmmnxopj52m"]}],"sizes":[24]},{"id":"r5","cells":[{"id":"r5:cell:0","items":["n17iwmyinli3rgl"]}],"sizes":[24]}]}}}}}
n17iabx2zxkxb68	n17iabx2zxkxb68	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"title"}}}}
vdzirm9qhrl	vdzirm9qhrl	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17i7bsl8233z49	n17i7bsl8233z49	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"priority"}}}}
u5qgoa53gta	u5qgoa53gta	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17iwmyinli3rgl	n17iwmyinli3rgl	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":6,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_tk_tickets","fieldPath":"status"}}}}
hgy7wgd9ljh	hgy7wgd9ljh	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"new","label":"新建","color":"default"},{"value":"assigned","label":"已指派","color":"blue"},{"value":"waiting_customer","label":"待客户","color":"orange"},{"value":"waiting_internal","label":"待内部","color":"purple"},{"value":"in_progress","label":"处理中","color":"cyan"},{"value":"resolved","label":"已解决","color":"green"},{"value":"closed","label":"已关闭","color":"default"},{"value":"reopened","label":"重开","color":"red"}]}}
n17rf9cys8w3ylp	n17rf9cys8w3ylp	{"parentId":"n17tbcdlj6fd8nd","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17wr2jbz8fl2i	n17wr2jbz8fl2i	{"schema":{"use":"RouteModel"}}
n17tx4b835evqu	n17tx4b835evqu	{"schema":{"use":"RouteModel"}}
n17pinqjvjgypnk	n17pinqjvjgypnk	{"parentId":"n17wr2jbz8fl2i","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"资产台账","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"资产台账","displayTitle":true,"enableTabs":false}}}}
n17g16z4mi0ul0l	n17g16z4mi0ul0l	{"parentId":"n17tx4b835evqu","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17tbldvqz31qpl	n17tbldvqz31qpl	{"use":"TableBlockModel","parentId":"n17g16z4mi0ul0l","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets"}}},"props":{}}
n17c8pgkbuk6e64	n17c8pgkbuk6e64	{"use":"TableColumnModel","parentId":"n17tbldvqz31qpl","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"name"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"资产名称","dataIndex":"name","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17c8pgkbuk6e64f	n17c8pgkbuk6e64f	{"use":"DisplayTextFieldModel","parentId":"n17c8pgkbuk6e64","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_as_assets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17ch6bazcr07d	n17ch6bazcr07d	{"use":"TableColumnModel","parentId":"n17tbldvqz31qpl","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"no"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"资产编号","dataIndex":"no","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17ch6bazcr07df	n17ch6bazcr07df	{"use":"DisplayTextFieldModel","parentId":"n17ch6bazcr07d","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_as_assets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17crhxkwzf7sr	n17crhxkwzf7sr	{"use":"TableColumnModel","parentId":"n17tbldvqz31qpl","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"category"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"类别","dataIndex":"category","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"it","label":"IT 设备","color":"blue"},{"value":"equipment","label":"专业设备","color":"cyan"},{"value":"furniture","label":"办公家具","color":"default"}]}}
n17crhxkwzf7srf	n17crhxkwzf7srf	{"use":"DisplayEnumFieldModel","parentId":"n17crhxkwzf7sr","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_as_assets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"it","label":"IT 设备","color":"blue"},{"value":"equipment","label":"专业设备","color":"cyan"},{"value":"furniture","label":"办公家具","color":"default"}]}}
n17cslr2i9g7kuf	n17cslr2i9g7kuf	{"use":"TableColumnModel","parentId":"n17tbldvqz31qpl","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"brand"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"品牌","dataIndex":"brand","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cslr2i9g7kuff	n17cslr2i9g7kuff	{"use":"DisplayTextFieldModel","parentId":"n17cslr2i9g7kuf","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_as_assets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17c2fvyad2qtyf	n17c2fvyad2qtyf	{"use":"TableColumnModel","parentId":"n17tbldvqz31qpl","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"in_use","label":"在用","color":"green"},{"value":"idle","label":"闲置","color":"default"},{"value":"repair","label":"维修中","color":"orange"},{"value":"retired","label":"报废","color":"red"}]}}
n17c2fvyad2qtyff	n17c2fvyad2qtyff	{"use":"DisplayEnumFieldModel","parentId":"n17c2fvyad2qtyf","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_as_assets","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"in_use","label":"在用","color":"green"},{"value":"idle","label":"闲置","color":"default"},{"value":"repair","label":"维修中","color":"orange"},{"value":"retired","label":"报废","color":"red"}]}}
n17an3n7pyb0h14s	n17an3n7pyb0h14s	{"parentId":"n17tbldvqz31qpl","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_as_assets","dataSourceKey":"main"}}}}
u45ktzo11wr	u45ktzo11wr	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
if5cnn4gway	if5cnn4gway	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
je1kdt8x04z	je1kdt8x04z	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
y7p33m8aqt0	y7p33m8aqt0	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ixcp82sn2hor"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17iu4nahi79te"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17imdtmtmid84l"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17i3qu8kc1enpm"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17itcutwj584r"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3","r4"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ixcp82sn2hor"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17iu4nahi79te"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17imdtmtmid84l"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17i3qu8kc1enpm"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17itcutwj584r"]}],"sizes":[24]}]}}}}}
n17ixcp82sn2hor	n17ixcp82sn2hor	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"name"}}}}
1dwn5ymmiz5	1dwn5ymmiz5	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17iu4nahi79te	n17iu4nahi79te	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"no"}}}}
locni456m4e	locni456m4e	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17imdtmtmid84l	n17imdtmtmid84l	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"category"}}}}
qrhl7c59gro	qrhl7c59gro	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"it","label":"IT 设备","color":"blue"},{"value":"equipment","label":"专业设备","color":"cyan"},{"value":"furniture","label":"办公家具","color":"default"}]}}
n17i3qu8kc1enpm	n17i3qu8kc1enpm	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"brand"}}}}
309w5lj1xh3	309w5lj1xh3	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17itcutwj584r	n17itcutwj584r	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":5,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_as_assets","fieldPath":"status"}}}}
7cfskbf9pgq	7cfskbf9pgq	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"in_use","label":"在用","color":"green"},{"value":"idle","label":"闲置","color":"default"},{"value":"repair","label":"维修中","color":"orange"},{"value":"retired","label":"报废","color":"red"}]}}
n17rf0cj9ogkds2h	n17rf0cj9ogkds2h	{"parentId":"n17tbldvqz31qpl","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17lhe5qyxu1g	n17lhe5qyxu1g	{"schema":{"use":"RouteModel"}}
n17t2r7mq7n0zol	n17t2r7mq7n0zol	{"schema":{"use":"RouteModel"}}
n17pjscv951m1bt	n17pjscv951m1bt	{"parentId":"n17lhe5qyxu1g","subKey":"page","subType":"object","use":"RootPageModel","props":{"title":"员工","displayTitle":true,"enableTabs":false},"stepParams":{"pageSettings":{"general":{"title":"员工","displayTitle":true,"enableTabs":false}}}}
n17gk3c58z6a4np	n17gk3c58z6a4np	{"parentId":"n17t2r7mq7n0zol","subKey":"grid","subType":"object","use":"BlockGridModel","props":{},"filterManager":[]}
n17tbc55f9eivj9	n17tbc55f9eivj9	{"use":"TableBlockModel","parentId":"n17gk3c58z6a4np","subKey":"items","subType":"array","sortIndex":1,"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees"}}},"props":{}}
n17cjbsfx4arh6j	n17cjbsfx4arh6j	{"use":"TableColumnModel","parentId":"n17tbc55f9eivj9","subKey":"columns","subType":"array","sortIndex":1,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"name"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"姓名","dataIndex":"name","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cjbsfx4arh6jf	n17cjbsfx4arh6jf	{"use":"DisplayTextFieldModel","parentId":"n17cjbsfx4arh6j","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_hr_employees","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cyubpij6h4lk	n17cyubpij6h4lk	{"use":"TableColumnModel","parentId":"n17tbc55f9eivj9","subKey":"columns","subType":"array","sortIndex":2,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"employee_no"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"工号","dataIndex":"employee_no","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cyubpij6h4lkf	n17cyubpij6h4lkf	{"use":"DisplayTextFieldModel","parentId":"n17cyubpij6h4lk","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_hr_employees","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cy8c0nc16uc	n17cy8c0nc16uc	{"use":"TableColumnModel","parentId":"n17tbc55f9eivj9","subKey":"columns","subType":"array","sortIndex":3,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"title"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"职务","dataIndex":"title","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cy8c0nc16ucf	n17cy8c0nc16ucf	{"use":"DisplayTextFieldModel","parentId":"n17cy8c0nc16uc","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_hr_employees","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17cvspe88cgfz	n17cvspe88cgfz	{"use":"TableColumnModel","parentId":"n17tbc55f9eivj9","subKey":"columns","subType":"array","sortIndex":4,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"phone"}},"tableColumnSettings":{"model":{"use":"DisplayTextFieldModel"}}},"props":{"title":"电话","dataIndex":"phone","width":150,"editable":false,"sorter":false,"fixed":"none"}}
n17cvspe88cgfzf	n17cvspe88cgfzf	{"use":"DisplayTextFieldModel","parentId":"n17cvspe88cgfz","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_hr_employees","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false}}
n17c908ttlh9dy	n17c908ttlh9dy	{"use":"TableColumnModel","parentId":"n17tbc55f9eivj9","subKey":"columns","subType":"array","sortIndex":5,"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"status"}},"tableColumnSettings":{"model":{"use":"DisplayEnumFieldModel"}}},"props":{"title":"状态","dataIndex":"status","width":150,"editable":false,"sorter":false,"fixed":"none","options":[{"value":"active","label":"在职","color":"green"},{"value":"on_leave","label":"休假","color":"orange"},{"value":"resigned","label":"离职","color":"default"}]}}
n17c908ttlh9dyf	n17c908ttlh9dyf	{"use":"DisplayEnumFieldModel","parentId":"n17c908ttlh9dy","subKey":"field","subType":"object","sortIndex":0,"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_hr_employees","dataSourceKey":"main"}}},"props":{"displayStyle":"text","overflowMode":"ellipsis","clickToOpen":false,"displayCopyButton":false,"options":[{"value":"active","label":"在职","color":"green"},{"value":"on_leave","label":"休假","color":"orange"},{"value":"resigned","label":"离职","color":"default"}]}}
n17an3rxdfkv2dcg	n17an3rxdfkv2dcg	{"parentId":"n17tbc55f9eivj9","subKey":"actions","subType":"array","sortIndex":1,"use":"AddNewActionModel","props":{},"stepParams":{"popupSettings":{"openView":{"collectionName":"hub_hr_employees","dataSourceKey":"main"}}}}
pt0c8yc6aux	pt0c8yc6aux	{"use":"ChildPageModel","subKey":"page","subType":"object","sortIndex":0,"props":{},"stepParams":{"pageSettings":{"general":{"displayTitle":false,"enableTabs":true}}}}
ozhtoox7sm4	ozhtoox7sm4	{"use":"ChildPageTabModel","subKey":"tabs","subType":"array","sortIndex":0,"props":{},"stepParams":{"pageTabSettings":{"tab":{"title":"{{t(\\"Add new\\")}}"}}}}
bc8jfbp20jd	bc8jfbp20jd	{"use":"BlockGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{}}
ts03aroo4ah	ts03aroo4ah	{"use":"CreateFormModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"resourceSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees"}}}}
09bvmy800vm	09bvmy800vm	{"use":"FormGridModel","subKey":"grid","subType":"object","sortIndex":0,"props":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ioagutsidh5k"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17ikcm5pqyaj0q"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17iy2uxhuz1vi"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17ihaqowd6qx27"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17im5r0b69pyc"]}],"sizes":[24]}],"rowGap":0,"colGap":16,"sizes":{},"rowOrder":["r0","r1","r2","r3","r4"]}},"stepParams":{"gridSettings":{"grid":{"layout":{"version":2,"rows":[{"id":"r0","cells":[{"id":"r0:cell:0","items":["n17ioagutsidh5k"]}],"sizes":[24]},{"id":"r1","cells":[{"id":"r1:cell:0","items":["n17ikcm5pqyaj0q"]}],"sizes":[24]},{"id":"r2","cells":[{"id":"r2:cell:0","items":["n17iy2uxhuz1vi"]}],"sizes":[24]},{"id":"r3","cells":[{"id":"r3:cell:0","items":["n17ihaqowd6qx27"]}],"sizes":[24]},{"id":"r4","cells":[{"id":"r4:cell:0","items":["n17im5r0b69pyc"]}],"sizes":[24]}]}}}}}
n17ioagutsidh5k	n17ioagutsidh5k	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":1,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"name"}}}}
s4gpbgzoq0f	s4gpbgzoq0f	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17ikcm5pqyaj0q	n17ikcm5pqyaj0q	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":2,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"employee_no"}}}}
qo0jrarc6dk	qo0jrarc6dk	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17iy2uxhuz1vi	n17iy2uxhuz1vi	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":3,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"title"}}}}
0dc0c0ana94	0dc0c0ana94	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17ihaqowd6qx27	n17ihaqowd6qx27	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":4,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"phone"}}}}
dcj1hbaasac	dcj1hbaasac	{"use":"InputFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{}}
n17im5r0b69pyc	n17im5r0b69pyc	{"use":"FormItemModel","subKey":"items","subType":"array","sortIndex":5,"props":{},"stepParams":{"fieldSettings":{"init":{"dataSourceKey":"main","collectionName":"hub_hr_employees","fieldPath":"status"}}}}
xfpaufi552t	xfpaufi552t	{"use":"SelectFieldModel","subKey":"field","subType":"object","sortIndex":0,"props":{"allowClear":true,"options":[{"value":"active","label":"在职","color":"green"},{"value":"on_leave","label":"休假","color":"orange"},{"value":"resigned","label":"离职","color":"default"}]}}
n17rfoy5a45e5yq8	n17rfoy5a45e5yq8	{"parentId":"n17tbc55f9eivj9","subKey":"actions","subType":"array","sortIndex":2,"use":"RefreshActionModel","props":{"title":"","icon":"ReloadOutlined"},"stepParams":{"buttonSettings":{"general":{"title":"","icon":"ReloadOutlined"}}}}
n17sb-96vmjc93frt	n17sb-96vmjc93frt	{"parentId":"96vmjc93frt","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-cyezqctu98x	n17sb-cyezqctu98x	{"parentId":"cyezqctu98x","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-dy1sditid2j	n17sb-dy1sditid2j	{"parentId":"dy1sditid2j","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-fg8vgdeq8o9	n17sb-fg8vgdeq8o9	{"parentId":"fg8vgdeq8o9","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-s32m18vob1c	n17sb-s32m18vob1c	{"parentId":"s32m18vob1c","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-sy34mnly8c6	n17sb-sy34mnly8c6	{"parentId":"sy34mnly8c6","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-ts03aroo4ah	n17sb-ts03aroo4ah	{"parentId":"ts03aroo4ah","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
n17sb-wqlv319eqdf	n17sb-wqlv319eqdf	{"parentId":"wqlv319eqdf","subKey":"actions","subType":"array","sortIndex":1,"use":"FormSubmitActionModel","props":{},"stepParams":{}}
5wcgnfdc2no	hlgkur2xy5y	{"schema":{"use":"RouteModel"}}
n18ai-96vmjc93frt	n18ai-96vmjc93frt	{"parentId":"96vmjc93frt","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"96vmjc93frt"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-cyezqctu98x	n18ai-cyezqctu98x	{"parentId":"cyezqctu98x","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"cyezqctu98x"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-dy1sditid2j	n18ai-dy1sditid2j	{"parentId":"dy1sditid2j","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"dy1sditid2j"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-fg8vgdeq8o9	n18ai-fg8vgdeq8o9	{"parentId":"fg8vgdeq8o9","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"fg8vgdeq8o9"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-s32m18vob1c	n18ai-s32m18vob1c	{"parentId":"s32m18vob1c","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"s32m18vob1c"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-sy34mnly8c6	n18ai-sy34mnly8c6	{"parentId":"sy34mnly8c6","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"sy34mnly8c6"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-ts03aroo4ah	n18ai-ts03aroo4ah	{"parentId":"ts03aroo4ah","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"ts03aroo4ah"}]},"style":{"mask":false,"size":40},"auto":false}}
n18ai-wqlv319eqdf	n18ai-wqlv319eqdf	{"parentId":"wqlv319eqdf","subKey":"actions","subType":"array","sortIndex":2,"use":"AIEmployeeButtonModel","props":{"aiEmployee":{"username":"dex"},"context":{"workContext":[{"type":"flow-model","uid":"wqlv319eqdf"}]},"style":{"mask":false,"size":40},"auto":false}}
4bosxnpl7oj	4bosxnpl7oj	{"schema":{"use":"RouteModel"}}
1x4bbxvx2rb	1x4bbxvx2rb	{"schema":{"use":"RouteModel"}}
08l3h3m1vxn	08l3h3m1vxn	{"schema":{"use":"RouteModel"}}
vqnu60n73n5	vqnu60n73n5	{"schema":{"use":"RouteModel"}}
\.


--
-- Name: desktopRoutes desktopRoutes_pkey; Type: CONSTRAINT; Schema: public; Owner: nocobase
--

ALTER TABLE ONLY public."desktopRoutes"
    ADD CONSTRAINT "desktopRoutes_pkey" PRIMARY KEY (id);


--
-- Name: flowModelTreePath flowModelTreePath_pkey; Type: CONSTRAINT; Schema: public; Owner: nocobase
--

ALTER TABLE ONLY public."flowModelTreePath"
    ADD CONSTRAINT "flowModelTreePath_pkey" PRIMARY KEY (ancestor, descendant);


--
-- Name: flowModels flowModels_pkey; Type: CONSTRAINT; Schema: public; Owner: nocobase
--

ALTER TABLE ONLY public."flowModels"
    ADD CONSTRAINT "flowModels_pkey" PRIMARY KEY (uid);


--
-- Name: desktop_routes_parent_id; Type: INDEX; Schema: public; Owner: nocobase
--

CREATE INDEX desktop_routes_parent_id ON public."desktopRoutes" USING btree ("parentId");


--
-- Name: flow_model_tree_path_descendant; Type: INDEX; Schema: public; Owner: nocobase
--

CREATE INDEX flow_model_tree_path_descendant ON public."flowModelTreePath" USING btree (descendant);


--
-- PostgreSQL database dump complete
--

\unrestrict xVx8cPRkCUzQtXy3wsfBAWQoXVPELSUFhGmKey97zSS0d0SCVZegjaYDyryUoP2
