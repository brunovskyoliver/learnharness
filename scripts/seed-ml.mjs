/** Synthetic feature-008 review records. No source requests or model calls. */
import { kitDemoHtml } from "../src/core/demo-kit-document.ts";
import { withTokenizedPanels, tokenize } from "../src/agent/tokenizer.ts";

export const mlReviewPanels = [
	{ type: "tokens", title: "How the model splits this text", text: "The unbelievable cat sat on the mat. 😀", encoding: "o200k" },
	{ type: "next_token", title: "Next-token probabilities", context: '"The cat sat on the"', tokens: JSON.stringify([3.2,2.6,2.2,2,1.4,1.2,1,.6].map((logit,i)=>({ text:[" mat"," floor"," sofa"," bed"," roof"," table"," chair"," windowsill"][i], logit }))) },
	{ type: "heatmap", title: "Attention weights, head 3", rows: '["The"," cat"," sat"," on"," the"," mat"]', cols: '["The"," cat"," sat"," on"," the"," mat"]', values: '[[1,0,0,0,0,0],[0.38,0.62,0,0,0,0],[0.12,0.61,0.27,0,0,0],[0.08,0.22,0.41,0.29,0,0],[0.21,0.09,0.14,0.33,0.23,0],[0.05,0.48,0.17,0.06,0.11,0.13]]', scale: "sequential", min: "0", max: "1", rowAxis: '"Query"', colAxis: '"Key"' },
	{ type: "network", title: "One training step, 2 → 3 → 1", layers: "[2,3,1]", weights: "[[[0.5,-0.4],[0.9,0.2],[-0.3,0.8]],[[0.7,-0.6,0.4]]]", biases: "[[0.1,-0.2,0.05],[0.1]]", input: "[1,0.5]", target: "[1]", activation: "sigmoid", loss: "mse" },
	{ type: "scatter", title: "Word vectors, projected to 2D", points: JSON.stringify([{label:"king",x:.7,y:.8,group:"royalty"},{label:"queen",x:.82,y:.9,group:"royalty"},{label:"prince",x:.6,y:.7,group:"royalty"},{label:"princess",x:.72,y:.8,group:"royalty"},{label:"man",x:.3,y:.3,group:"people"},{label:"woman",x:.4,y:.4,group:"people"},{label:"apple",x:-.5,y:-.4,group:"food"},{label:"orange",x:-.4,y:-.5,group:"food"}]), groups:'["royalty","people","food"]', arithmetic:'{"plus":["king","woman"],"minus":["man"]}', metric: "euclidean" },
	{ type: "shapes", title: "Multi-head attention, GPT-2 small", dims:'[{"name":"B","meaning":"batch"},{"name":"T","meaning":"tokens"},{"name":"C","meaning":"width 768"},{"name":"H","meaning":"heads 12"},{"name":"D","meaning":"head width 64"}]', steps: JSON.stringify([
		{op:"Input embeddings",shape:[{name:"B"},{name:"T"},{name:"C",size:768}]},
		{op:"Project to Q, K, V",shape:[{name:"B"},{name:"T"},{name:"3C",size:2304}]},
		{op:"Split into heads",shape:[{name:"B"},{name:"H",size:12},{name:"T"},{name:"D",size:64}]},
		{op:"Scores Q·Kᵀ / √D",shape:[{name:"B"},{name:"H",size:12},{name:"T"},{name:"T"}]},
		{op:"Softmax over keys",shape:[{name:"B"},{name:"H",size:12},{name:"T"},{name:"T"}]},
		{op:"Weights · V",shape:[{name:"B"},{name:"H",size:12},{name:"T"},{name:"D",size:64}]},
		{op:"Merge heads, project",shape:[{name:"B"},{name:"T"},{name:"C",size:768}]},
	]) },
];
export const mlReviewLiveTools = ["hub_search","hub_model","paper_search","paper_read","ml_visual","tokenize"];

export async function buildMlReviewChats(lesson, now = new Date()) {
	const timestamp = now.getTime(); let serial = 0;
	const template = lesson.messages.find(m => m.role === "assistant");
	const assistant = content => ({ ...structuredClone(template), id:`review_ml_message_${++serial}`, content, timestamp: timestamp + serial, responseId: undefined, usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}} });
	const user = text => ({ id:`review_ml_user_${++serial}`, role:"user", content:text, timestamp:timestamp + serial });
	const pair = (name, input, details, error) => {
		const id = `review_ml_call_${++serial}`;
		return [assistant([{type:"toolCall",id,name,arguments:input}]), { id:`${id}_result`, role:"toolResult",toolCallId:id,toolName:name,content:[{type:"text",text:error || (name === "ml_visual" ? `Panel shown: ${details.result.title}.` : "Synthetic review result.")}], ...(details ? {details}:{}),isError:!!error,timestamp:timestamp + serial }];
	};
	const panelPair = async (panel, spec = { panels:[panel] }) => pair("ml_visual",{kind:panel.type,title:panel.title}, {kind:"demo",result:{title:panel.title,html:kitDemoHtml(await withTokenizedPanels(spec)),tested:true}});
	const panelMessages = [];
	for (const panel of mlReviewPanels) panelMessages.push(user(panel.title), ...await panelPair(panel));
	const scatter3d = {...mlReviewPanels[4],title:"Word vectors, projected to 3D",points:JSON.stringify(JSON.parse(mlReviewPanels[4].points).map((p,i)=>({...p,z:i/10})))};
	panelMessages.push(user(scatter3d.title),...await panelPair(scatter3d));
	const composed = {...mlReviewPanels[0],title:"Linked tokens and attention",text:"The cat sat on the mat",link:"words"};
	panelMessages.push(user(composed.title),...await panelPair(composed,{params:{temperature:{type:"slider",label:"Temperature",min:.1,max:2,step:.1,value:1}},panels:[composed,{...mlReviewPanels[2],link:"words"},{...mlReviewPanels[1],temperature:"p.temperature",link:"words"}]}));
	panelMessages.push(user("Failed panel"),...pair("ml_visual",{kind:"heatmap",title:"Failed panel"},null,"The panel failed its check and was not shown:\n- values: provide a finite number for every row and column, at most 64×64"));
	const tokens = await tokenize("The cat sat on the mat.","o200k");
	const paper = {title:"Attention Is All You Need",authors:["Vaswani","Shazeer","Parmar","Uszkoreit"],year:2017,arxivId:"1706.03762",url:"https://arxiv.org/abs/1706.03762",pdfUrl:"https://arxiv.org/pdf/1706.03762"};
	const lookupMessages = [user("ML lookup review")];
	const results = [
		["hub_model",{repo:"openai-community/gpt2"},{kind:"model",repo:"openai-community/gpt2",url:"https://huggingface.co/openai-community/gpt2",fields:[{label:"Layers",key:"n_layer",value:12},{label:"Hidden width",key:"n_embd",value:768},{label:"Heads",key:"n_head",value:12},{label:"Vocabulary",key:"vocab_size",value:50257},{label:"Context",key:"n_positions",value:1024}],ms:1200}],
		...["models","datasets","papers"].map(what=>["hub_search",{kind:what,query:"tiny llama"},{kind:"search",what,query:"tiny llama",results:[{id:"openai-community/gpt2",title:"gpt2",task:"text-generation",downloads:"24.1M",url:"https://huggingface.co/openai-community/gpt2"}],ms:900}]),
		["paper_search",{query:"Attention Is All You Need"},{source:"arxiv",query:"Attention Is All You Need",results:[paper],ms:800}],
		["paper_search",{query:"LoRA"},{source:"semantic-scholar",query:"LoRA",results:[{...paper,title:"LoRA: Low-Rank Adaptation of Large Language Models",authors:["Hu","Shen","Wallis","Allen-Zhu"],year:2021,arxivId:"2106.09685",url:"https://arxiv.org/abs/2106.09685",pdfUrl:"https://arxiv.org/pdf/2106.09685"}],ms:700}],
		["paper_read",{arxivId:"1706.03762",pages:[3,4,5]},{title:paper.title,paper:{arxivId:paper.arxivId,url:paper.pdfUrl},pages:[3,4,5],pagesUsedThisTurn:3,cap:10,ms:1500}],
		["tokenize",{text:"The cat sat on the mat.",encoding:"o200k"},{encoding:"o200k",count:tokens.length,tokens}],
	];
	for (const [tool,input,details] of results) lookupMessages.push(...pair(tool,input,details));
	for (const [tool,reason] of [["hub_search","The Hugging Face lookup is unavailable: Hugging Face is limiting anonymous requests right now. Try again in a minute."],["hub_model","The Hugging Face lookup is unavailable: the model could not be found."],["paper_search","The paper search is unavailable: the service could not be reached."],["paper_read","The paper could not be read: no open-access PDF is available."],["tokenize","Tokenization is unavailable: review failure."]]) lookupMessages.push(...pair(tool,{},null,reason));
	lookupMessages.push(assistant([{type:"text",text:"Each head scales its dot products by 1/√dₖ so the softmax does not saturate when dₖ is large ([Vaswani et al., 2017, p. 4](https://arxiv.org/pdf/1706.03762#page=4)). GPT-2 small uses 12 heads of width 64 over a 768-wide stream ([gpt2 config on Hugging Face](https://huggingface.co/openai-community/gpt2/blob/main/config.json))."}]));
	// Unfinished calls are honest settled rows. The production review harness streams
	// these tool names through the real session transport to inspect running rows.
	lookupMessages.push(user("Unfinished lookup review"),assistant(mlReviewLiveTools.map(name=>({type:"toolCall",id:`review_ml_unfinished_${name}`,name,arguments:{query:"review-input-must-not-appear-live"}}))));
	const practiceMessages = [user("Token practice"),...await panelPair({...mlReviewPanels[0],title:"Practice tokens"}),assistant([{type:"toolCall",id:"review_ml_problem",name:"problem",arguments:{statement:"Change the text in the panel. Explain why adding one character can change more than one token.",mode:"recall",modelSolution:"Tokenization merges byte sequences, so an edit can change nearby merges.",target:[]}}])];
	practiceMessages.push({id:"review_ml_problem_result",role:"toolResult",toolCallId:"review_ml_problem",toolName:"problem",content:[{type:"text",text:"Problem posed — the turn ends here; the learner’s thinking traces and answer commits arrive as labeled messages."}],details:null,isError:false,timestamp:timestamp+serial+1});
	const record = (id,title,messages,kind) => ({version:1,id,title,createdAt:now.toISOString(),updatedAt:now.toISOString(),messages,...(kind?{kind}:{})});
	return [record("review-ml-panels","UI review · ML panels",panelMessages),record("review-ml-lookups","UI review · ML lookups",lookupMessages),record("review-ml-practice","UI review · ML practice",practiceMessages,"practice")];
}
