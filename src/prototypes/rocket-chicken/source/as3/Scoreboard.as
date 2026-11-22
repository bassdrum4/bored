package
{
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol832")]
   public class Scoreboard extends MovieClip
   {
      
      public var birdbtn:MovieClip;
      
      public var sc:MovieClip;
      
      public var backto:MovieClip;
      
      private var distance:Number = 0;
      
      private var points:Number = 0;
      
      private var time:Number = 0;
      
      private var bonuses:Number = 0;
      
      private var pts:int = 0;
      
      private var dist:int = 0;
      
      private var tim:int = 0;
      
      private var bon:int = 0;
      
      private var Setted:Boolean = false;
      
      private var total:int = 0;
      
      public var updating:Boolean = false;
      
      private var cashed:int = 0;
      
      public function Scoreboard()
      {
         super();
      }
      
      public function Set(param1:int, param2:int, param3:int, param4:int = 0) : void
      {
         if(!this.updating && !this.Setted)
         {
            this.dist = param1;
            this.pts = param2 * 0.5;
            this.tim = param3 * 1.5;
            this.bon = param4;
            this.Setted = true;
            this.updating = true;
         }
      }
      
      public function Update() : void
      {
         if(!this.updating)
         {
            return;
         }
         this.distance = this.dist;
         this.points = this.pts;
         this.time = this.tim;
         this.bonuses = this.bon;
         this.sc.disttxt.text = "Distance: " + int(this.distance) + " ft.";
         this.sc.ptstxt.text = "Height: " + int(this.points) + " ft.";
         this.sc.timtxt.text = "Time: " + int(this.time) + " sec.";
         this.sc.bontxt.text = "Bonus: " + "$" + int(this.bonuses);
         if(this.distance > globalVars.allTimeBest)
         {
            globalVars.allTimeBest = this.distance;
            this.sc.msg.text = "YOUR ALL TIME BEST!";
         }
         this.sc.adm.scaleX = 0.85;
         this.sc.adm.scaleY = 0.85;
         this.total = this.distance * 2 + this.points * 1.5 + this.time * 1.5 + this.bonuses;
         this.sc.tottxt.text = "Total: " + "$" + this.total;
         if(this.cashed == 0)
         {
            globalVars.cash += this.total;
            this.cashed = 1;
         }
         this.updating = false;
         this.Clear();
      }
      
      public function Default() : void
      {
         this.cashed = 0;
         this.sc.tottxt.text = "";
         this.sc.disttxt.text = "";
         this.sc.ptstxt.text = "";
         this.sc.timtxt.text = "";
         this.sc.bontxt.text = "";
      }
      
      public function Clear() : void
      {
         this.sc.x = 821;
         this.points = 0;
         this.time = 0;
         this.distance = 0;
         this.bonuses = 0;
         this.total = 0;
         this.Setted = false;
         this.cashed = 0;
      }
   }
}

